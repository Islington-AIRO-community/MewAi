'use client';

import { EN, NE, NE_TABLES } from './i18n-strings';
import { CATEGORIES, DEPARTMENTS, PRIORITIES, STAGES, SUPPORT_TYPES } from './types';

/**
 * Browser-based English → Nepali translation.
 *
 * **What this is.** A second localisation layer under the curated tables in
 * `i18n-strings.ts`. The tables are partial *on purpose* — the module header
 * says long-form prose is left in English because a mistranslated paragraph in
 * an emergency tool is worse than a readable English one. This is the mechanism
 * for translating that prose at read time, on the visitor's own device, using
 * the browser's own on-device model (`window.Translator`, Chrome 138+). No
 * server, no API key, and no page text leaves the device, which is the only
 * version of this feature that is defensible next to a reporter's address.
 *
 * **It is deliberately not a general page translator.** It is bounded in three
 * ways, each of which exists because of something this app is built on:
 *
 * 1. **Curated strings win, always.** Anything with a human-reviewed Nepali
 *    translation in `EN`/`NE` or `NE_TABLES` is served from there and never
 *    sent to the model. Those labels were written to a length budget, and
 *    `Button` is `whitespace-nowrap`, so a model's over-long replacement is a
 *    layout bug, not a translation.
 * 2. **No navigation, no button labels, no reporter data.** `A` and `BUTTON`
 *    text is skipped, as is anything under `[data-no-translate]` — which is how
 *    the header, the admin queue, ticket facts and the assistant transcript are
 *    excluded. Those are tuned chrome, operator-only wording, or PII.
 * 3. **Anything without a trustworthy translation is left exactly as it is.**
 *    See `isAcceptable`, which is the heart of this file.
 *
 * **The gate is the feature.** A neural model never says "I don't know" — it
 * returns *something* for everything, confidently. So "keep it as it is if
 * there is no exact translation" cannot be delegated to the model; it has to be
 * enforced by the caller, and it is enforced conservatively: English beats a
 * wrong number, every time.
 *
 * **React owns this DOM.** Translation is applied by writing to text nodes,
 * which is how every browser translation feature works and the only way to reach
 * copy that is not behind a `t()` call. A `MutationObserver` re-applies after
 * React re-renders, because otherwise the first state change would silently
 * un-translate the page. Nothing here runs during the first render, so the
 * prerendered HTML is untouched and there is no hydration mismatch — the same
 * bargain `lib/i18n.tsx` makes, and for the same reason.
 */

interface TranslateProgress {
  phase: 'downloading' | 'translating';
  /** 0..1, or `null` when the browser has not reported a total yet. */
  ratio: number | null;
  done: number;
  total: number;
}

export interface TranslateResult {
  /** Text nodes rewritten. */
  translated: number;
  /** Text nodes deliberately left in English. */
  kept: number;
  /** Distinct strings not sent because the per-page call budget ran out. */
  notSent: number;
}

export interface TranslateSession {
  /** Walks `root`, then keeps watching it for content React adds later. */
  translate(root: Element): Promise<TranslateResult>;
  /** Put every text node back exactly as it was and stop watching. */
  restore(): void;
  /** `restore()` plus freeing the model. */
  destroy(): void;
}

/**
 * Model calls per activation.
 *
 * A dense triage screen carries a few hundred distinct strings, and the model
 * answers them one at a time. The cap keeps a click bounded to something a
 * person will wait for, and anything past it is reported as `notSent` rather
 * than silently dropped — an incomplete translation that says so is useful, an
 * incomplete one that claims to be finished is not.
 */
const MAX_MODEL_CALLS = 200;

/** Concurrent model calls. The API serialises internally; this is a politeness
 *  cap, not a throughput setting. */
const POOL_SIZE = 4;

/** Sentences longer than this are split on sentence boundaries. */
const CHUNK_LIMIT = 420;

const LATIN_LETTER = /[A-Za-z]/;
const LOWERCASE = /[a-z]/;
const DEVANAGARI = /[\u0900-\u097F]/;

/**
 * Elements whose text the model never sees.
 *
 * `SCRIPT`/`STYLE`/`NOSCRIPT` are not copy at all. `CODE`/`PRE`/`KBD` are
 * literals a responder has to read back exactly, and a model that "translates"
 * a log line has destroyed it.
 *
 * `SVG` is in here for the element itself, but it does **not** cover SVG text:
 * a label lives in `<text>` or `<tspan>`, whose `tagName` is neither of those and
 * which is not a descendant match for a tag-name set. That is handled by the
 * namespace check in `isExcluded`, which is total — see the note there.
 */
const EXCLUDED_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TITLE',
  'TEXTAREA',
  'SELECT',
  'OPTION',
  'CODE',
  'PRE',
  'KBD',
  'SAMP',
  'VAR',
]);

const SVG_NS = 'http://www.w3.org/2000/svg';

/* ------------------------------------------------------------------ *
 * The curated layer
 * ------------------------------------------------------------------ */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normKey(value: string): string {
  return value
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * A key with every number collapsed, so `'You have 3 open requests'` can find
 * the template it came from. Without this every `{n}` string would miss the
 * curated table the moment a real count was substituted into it.
 *
 * **The placeholder has to collapse too, and leaving it in is a silent bug.** A
 * template's shape is `'you have # open requests'`, not
 * `'you have {n} open requests'` — a `{n}` left in the key can never equal a
 * rendered digit, so every template lookup returns `null`, every one of them
 * falls through to the model, and the page quietly stops being the reviewed
 * translation this index exists to provide. Nothing errors; the model path still
 * works, which is what makes it silent.
 *
 * Collapsing placeholders and digits to the same `#` is safe because this index
 * is only a candidate filter. `interpolateFromRendered` re-checks each candidate
 * against a regex built from the real template, so a shape collision costs a
 * scan and never a wrong substitution.
 */
function shapeKey(value: string): string {
  return normKey(value).replace(/\{\w+\}/g, '#').replace(/\d+/g, '#');
}

/**
 * Build a matcher for a template, e.g. `'~{n} min'` → `/^~(\S+)\s+min\s*$/`.
 *
 * Returns `null` when the template has no placeholder, because there is nothing
 * to substitute and the exact index already covers it.
 *
 * **Every whitespace run becomes `\s+`, including the ones that touch a
 * placeholder.** A matcher built by escaping each literal run and dropping its
 * outer spaces comes out as `have(\S+)open` — no space on either side of the
 * capture — and then matches nothing at all, so every template silently falls
 * through to the model. Loosening whitespace rather than dropping it is what
 * also lets one template match copy that was wrapped across lines.
 */
function templateMatcher(template: string): RegExp | null {
  const parts = template.split(/(\{\w+\})/g);
  if (!parts.some((part) => /^\{\w+\}$/.test(part))) return null;

  let source = '^';
  for (const part of parts) {
    if (/^\{\w+\}$/.test(part)) {
      source += '(\\S+)';
      continue;
    }
    for (const bit of part.split(/(\s+)/)) {
      if (bit.length === 0) continue;
      source += /^\s+$/.test(bit) ? '\\s+' : escapeRegExp(bit);
    }
  }
  return new RegExp(`${source}\\s*$`);
}

/**
 * Recover the substituted values from the rendered English and drop them into
 * the Nepali template.
 *
 * Returns `null` on anything it cannot do confidently. That is the safe
 * direction: a wrong substitution would put a real number into the wrong slot,
 * whereas returning `null` just falls through to the model, whose output the
 * digit check in `isAcceptable` still has to pass.
 */
function interpolateFromRendered(
  rendered: string,
  enTemplate: string,
  neTemplate: string,
): string | null {
  const matcher = templateMatcher(enTemplate);
  if (!matcher) return null;
  const match = rendered.trim().match(matcher);
  if (!match) return null;

  let capture = 0;
  const filled = neTemplate.replace(/\{(\w+)\}/g, (whole) => {
    const value = match[++capture];
    return value === undefined ? whole : value;
  });
  // A placeholder the matcher could not fill means the rendered string did not
  // come from this template. Shipping `{n}` to a screen is not an option.
  return /\{\w+\}/.test(filled) ? null : filled;
}

type ShapeEntry = { en: string; ne: string };

let exactIndex: Map<string, string> | null = null;
let shapeIndex: Map<string, ShapeEntry[]> | null = null;

function buildIndexes(): void {
  const exact = new Map<string, string>();
  const shapes = new Map<string, ShapeEntry[]>();

  const put = (en?: string | null, ne?: string | null): void => {
    if (!en || !ne) return;
    if (en.includes('{')) {
      const key = shapeKey(en);
      const list = shapes.get(key);
      if (list) list.push({ en, ne });
      else shapes.set(key, [{ en, ne }]);
      return;
    }
    const key = normKey(en);
    if (key && !exact.has(key)) exact.set(key, ne);
  };

  // Sentences. `EN` is the single place English copy is defined.
  for (const key of Object.keys(EN)) put(EN[key], NE[key]);

  // Taxonomy labels. English stays on the object and Nepali lives in
  // `NE_TABLES` — see the header of `i18n-strings.ts` for why that split is
  // deliberate, and do not "fix" it by duplicating English here.
  for (const category of Object.values(CATEGORIES)) {
    const ne = NE_TABLES.category[category.id];
    put(category.label, ne);
    put(category.shortLabel, ne);
    // The tile hint is `description.split(',')[0]`, and `categoryHint` is
    // written to that same one-clause budget.
    put(category.description.split(',')[0], NE_TABLES.categoryHint[category.id]);
  }
  for (const priority of Object.values(PRIORITIES)) {
    put(priority.label, NE_TABLES.priority[priority.id]);
  }
  for (const stage of STAGES) {
    put(stage.label, NE_TABLES.stage[stage.id]);
    put(stage.short, NE_TABLES.stageShort[stage.id]);
    put(stage.short, NE_TABLES.stageChip[stage.id]);
  }
  for (const support of Object.values(SUPPORT_TYPES)) {
    put(support.label, NE_TABLES.support[support.id]);
  }
  for (const dept of DEPARTMENTS) {
    put(dept.name, NE_TABLES.department[dept.id]);
    put(dept.statusLabel, NE_TABLES.status[dept.status]);
    put(dept.coverage, NE_TABLES.coverage[dept.id]);
  }

  exactIndex = exact;
  shapeIndex = shapes;
}

/**
 * The reviewed Nepali for a rendered English string, or `null` if there isn't
 * an exact one. This is the "exact translation" the button promises to prefer.
 */
function curatedLookup(rendered: string): string | null {
  if (!exactIndex || !shapeIndex) buildIndexes();

  const direct = exactIndex!.get(normKey(rendered));
  if (direct) return direct;

  const candidates = shapeIndex!.get(shapeKey(rendered));
  if (!candidates) return null;
  for (const candidate of candidates) {
    const filled = interpolateFromRendered(rendered, candidate.en, candidate.ne);
    if (filled) return filled;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * "Keep it as it is" — the two gates
 * ------------------------------------------------------------------ */

/** The text with surrounding whitespace removed, which is what is looked up. */
function coreOf(value: string): string {
  return value.trim();
}

/**
 * Is this string worth translating at all?
 *
 * The rules are all about *what kind of string* this is rather than about how
 * confident a translation would be:
 *
 * - No lowercase letter means an acronym, a code, or a number — `SOS`, `BETA`,
 *   `TKT-000042`, `9801234567`. A model will happily turn `SOS` into `एसओएस`,
 *   which is worse than leaving it, and there is nothing to gain.
 * - No Latin letter means it is already Nepali, or it is punctuation. Either
 *   way the model has no work to do.
 * - Already containing Devanagari means the string is at least partly Nepali.
 *   Translating it would produce a half-and-half sentence, which is the worst
 *   of both languages at once.
 */
function isTranslatable(text: string): boolean {
  const core = coreOf(text);
  if (!core) return false;
  if (!LOWERCASE.test(core)) return false;
  if (!LATIN_LETTER.test(core)) return false;
  if (DEVANAGARI.test(core)) return false;
  return true;
}

const DEVANAGARI_DIGIT_VALUE: Record<string, string> = {
  '०': '0',
  '१': '1',
  '२': '2',
  '३': '3',
  '४': '4',
  '५': '5',
  '६': '6',
  '७': '7',
  '८': '8',
  '९': '9',
};

/**
 * Every digit in a string, sorted, as one comparable string.
 *
 * A multiset of *individual* digits rather than of digit-runs, so that a model
 * choosing to group a number (`9,801,234,567`) is not mistaken for a model that
 * dropped one. Devanagari digits are folded to ASCII first, so a choice of
 * numeral system is not mistaken for a lost number either — which is the
 * comparison being neutral about, not the rendering: this app keeps Latin digits
 * on purpose (see `i18n-strings.ts`), but that is a formatting decision made at
 * the value layer, and it is not this gate's business.
 */
function digitBag(value: string): string {
  const folded = value.replace(
    /[०-९]/g,
    (digit) => DEVANAGARI_DIGIT_VALUE[digit] ?? digit,
  );
  return (folded.match(/\d/g) ?? []).sort().join('');
}

/**
 * Would shipping this translation be better than shipping the English?
 *
 * Everything here is a veto. There is no score above which a result is
 * accepted, because a confidence number from a model that always answers is
 * not evidence of anything. The only safe default in a relief tool is to leave
 * the text alone.
 *
 * - **Empty** — nothing came back.
 * - **Echo** — the model returned the English unchanged, which is its only way
 *   of declining. The honest reading is "no translation", so the original stays.
 * - **No Devanagari** — the input had Latin letters and the output has no
 *   Devanagari, so nothing was translated: a transliteration, a passthrough, or
 *   a refusal dressed as an answer.
 * - **Lost or invented a digit** — a phone number a responder has to dial, a
 *   ticket reference, a count of people affected, a distance. A model that
 *   cannot reproduce the digits has not translated the text, it has rewritten
 *   the facts, and on this app that is the one failure worth refusing outright.
 *   This also over-rejects: a model that spells `24` out as `चौबीस` loses the
 *   digit check and the sentence stays English. That is the intended direction of
 *   the error — see the header note on `digitBag`.
 * - **Collapsed** — output far shorter than the input, which is what a truncated
 *   or half-finished response looks like.
 */
function isAcceptable(original: string, out: string): boolean {
  const before = coreOf(original);
  const after = coreOf(out);
  if (!after) return false;
  if (normKey(after) === normKey(before)) return false;
  if (LATIN_LETTER.test(before) && !DEVANAGARI.test(after)) return false;
  if (digitBag(before) !== digitBag(after)) return false;
  if (after.length < before.length * 0.3) return false;
  return true;
}

/* ------------------------------------------------------------------ *
 * Chunking
 * ------------------------------------------------------------------ */

/**
 * Split a long sentence on sentence boundaries.
 *
 * The gate runs per chunk, so a paragraph the model mangled in one sentence
 * keeps only that sentence in English rather than losing the whole block.
 */
function chunk(text: string, limit = CHUNK_LIMIT): string[] {
  if (text.length <= limit) return [text];

  const sentences = text.split(/(?<=[.!?…])\s+/);
  const out: string[] = [];
  let buffer = '';

  for (const sentence of sentences) {
    if (buffer && buffer.length + sentence.length + 1 > limit) {
      out.push(buffer);
      buffer = sentence;
    } else {
      buffer = buffer ? `${buffer} ${sentence}` : sentence;
    }
  }
  if (buffer) out.push(buffer);
  return out;
}

/* ------------------------------------------------------------------ *
 * The session
 * ------------------------------------------------------------------ */

interface Applied {
  original: string;
  translated: string;
}

class Session implements TranslateSession {
  private readonly translator: Translator;
  private readonly onProgress?: (progress: TranslateProgress) => void;
  private readonly signal?: AbortSignal;

  /** text node → what it was, so `restore()` is exact. */
  private readonly applied = new Map<Text, Applied>();
  /** One model call per distinct string, shared by every node using it. */
  private readonly inflight = new Map<string, Promise<string | null>>();

  private observer: MutationObserver | null = null;
  private readonly pendingRoots = new Set<Element>();
  private frame = 0;

  constructor(
    translator: Translator,
    onProgress?: (progress: TranslateProgress) => void,
    signal?: AbortSignal,
  ) {
    this.translator = translator;
    this.onProgress = onProgress;
    this.signal = signal;
  }

  async translate(root: Element): Promise<TranslateResult> {
    const { considered, groups } = this.scan(root);

    let translated = 0;

    // Curated first: free, reviewed, and the only source for tuned labels.
    const pending: string[] = [];
    for (const [core, nodes] of groups) {
      const curated = curatedLookup(core);
      if (curated === null) {
        pending.push(core);
        continue;
      }
      for (const node of nodes) this.apply(node, curated);
      translated += nodes.length;
    }

    const budget = Math.min(pending.length, MAX_MODEL_CALLS);
    const notSent = pending.length - budget;
    const queue = pending.slice(0, budget);

    let cursor = 0;
    let done = 0;
    const worker = async (): Promise<void> => {
      while (cursor < queue.length) {
        if (this.signal?.aborted) return;
        const core = queue[cursor++];
        const out = await this.translateOnce(core);
        const nodes = groups.get(core);
        if (out !== null && nodes) {
          for (const node of nodes) this.apply(node, out);
          translated += nodes.length;
        }
        done += 1;
        this.onProgress?.({
          phase: 'translating',
          ratio: queue.length ? done / queue.length : 1,
          done,
          total: queue.length,
        });
      }
    };
    await Promise.all(Array.from({ length: POOL_SIZE }, worker));

    this.watch();
    return { translated, kept: considered - translated, notSent };
  }

  restore(): void {
    for (const [node, entry] of this.applied) {
      if (node.isConnected) node.nodeValue = entry.original;
    }
    this.applied.clear();
    this.inflight.clear();

    this.observer?.disconnect();
    this.observer = null;

    if (this.frame) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
    this.pendingRoots.clear();
  }

  destroy(): void {
    this.restore();
    this.translator.destroy();
  }

  /* ---------------------------------------------------------------- *
   * Internals
   * ---------------------------------------------------------------- */

  /**
   * Collect the text nodes worth translating, grouped by their string.
   *
   * Grouping is not an optimisation detail: a triage screen repeats "Available",
   * "Call" and the whole department roster in three places, and the model does
   * not benefit from being asked the same question four times.
   */
  private scan(root: Element): { considered: number; groups: Map<string, Text[]> } {
    const groups = new Map<string, Text[]>();
    let considered = 0;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node: Node) => {
        const value = node.nodeValue;
        // Cheap pre-filter: no Latin letter, no point descending further.
        if (!value || !LATIN_LETTER.test(value)) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent || this.isExcluded(parent)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const core = coreOf(node.nodeValue ?? '');
      if (!isTranslatable(core)) continue;
      considered += 1;
      const list = groups.get(core);
      if (list) list.push(node as Text);
      else groups.set(core, [node as Text]);
    }

    return { considered, groups };
  }

  private isExcluded(element: Element): boolean {
    if (element.closest('[data-no-translate]')) return true;
    if (EXCLUDED_TAGS.has(element.tagName)) return true;
    // Anything in the SVG namespace is geometry, or a label drawn on it — and
    // either way the text has to keep the exact string the drawing was laid out
    // against, because a longer Nepali label does not reflow a `<text>` and
    // overflows the map. The namespace is the test because a tag-name list is
    // not: `<text>` and `<tspan>` are the elements that actually hold the
    // characters, and neither appears in `EXCLUDED_TAGS`.
    if (element.namespaceURI === SVG_NS) return true;
    // Never rewrite a value someone typed, and never rewrite an option inside a
    // `<select>`: the control's value and its visible text have to stay the same
    // string. `isContentEditable` is on `HTMLElement`, and it already answers for
    // ancestors — a text node inside a `contenteditable` wrapper is editable
    // without the wrapper itself carrying the attribute.
    if (element.tagName === 'INPUT') return true;
    if (element instanceof HTMLElement && element.isContentEditable) return true;
    // Navigation and button labels are curated, and `Button` is
    // `whitespace-nowrap` — an over-long model label inside a grid cell
    // overflows it. There is nothing to gain here and a layout regression to
    // pay, so the model does not get a say on button copy at all.
    if (element.tagName === 'BUTTON' || element.tagName === 'A') return true;
    return false;
  }

  /** One model call per distinct string, de-duplicated across overlapping runs. */
  private translateOnce(core: string): Promise<string | null> {
    const existing = this.inflight.get(core);
    if (existing) return existing;

    const run = this.runModel(core).finally(() => this.inflight.delete(core));
    this.inflight.set(core, run);
    return run;
  }

  private async runModel(core: string): Promise<string | null> {
    const parts = chunk(core);
    const pieces: string[] = [];
    let changed = false;

    for (const part of parts) {
      if (this.signal?.aborted) return null;
      let out: string;
      try {
        out = await this.translator.translate(
          part,
          this.signal ? { signal: this.signal } : undefined,
        );
      } catch {
        // A refused call is not a page failure. The gate would have rejected a
        // bad result anyway; this only covers the browser declining outright.
        return null;
      }
      if (isAcceptable(part, out)) {
        pieces.push(coreOf(out));
        changed = true;
      } else {
        pieces.push(part);
      }
    }

    // Nothing survived the gate, so there was no exact translation — which is an
    // answer, not a failure. Leaving the string alone is the whole point.
    return changed ? pieces.join(' ') : null;
  }

  /**
   * Write a translation, preserving the whitespace around the text.
   *
   * React renders `{' '}` and template joins into the same nodes, so trimming
   * the stored value would close a gap in the layout. The original is also
   * refreshed whenever the node no longer holds what we last wrote: that means
   * React re-rendered it, and the current text is the new English to restore to.
   */
  private apply(node: Text, translated: string): void {
    const current = node.nodeValue ?? '';
    const previous = this.applied.get(node);
    const original =
      previous && current === previous.translated ? previous.original : current;

    const lead = original.match(/^\s*/)?.[0] ?? '';
    const core = original.slice(lead.length).replace(/\s+$/, '');
    if (!core) return;
    const tail = original.slice(lead.length + core.length);

    const next = `${lead}${translated}${tail}`;
    // Recorded before the write so the observer can recognise its own echo.
    this.applied.set(node, { original, translated: next });
    node.nodeValue = next;
  }

  /**
   * React re-renders by writing new strings into the same text nodes, which
   * would silently un-translate whatever it touched. Re-applying on mutation
   * keeps the page translated across navigation and async data, and the
   * character-data filter below stops it from reacting to its own writes.
   */
  private watch(): void {
    if (this.observer || !document.body) return;

    this.observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'characterData') {
          const node = record.target as Text;
          const entry = this.applied.get(node);
          if (entry && node.nodeValue === entry.translated) continue;
          const parent = node.parentElement;
          if (parent) this.pendingRoots.add(parent);
          continue;
        }
        for (const added of record.addedNodes) {
          const element =
            added.nodeType === Node.ELEMENT_NODE ? (added as Element) : added.parentElement;
          if (element) this.pendingRoots.add(element);
        }
      }
      if (this.pendingRoots.size > 0) this.schedule();
    });

    this.observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  private schedule(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      const roots = Array.from(this.pendingRoots);
      this.pendingRoots.clear();
      if (roots.length === 0 || this.signal?.aborted) return;

      for (const root of roots) {
        if (!root.isConnected || this.isExcluded(root)) continue;

        const { groups } = this.scan(root);
        for (const [core, nodes] of groups) {
          // Every node in this group is already showing a translation, so the
          // group was merely re-parented. Nothing to do.
          if (nodes.every((node) => this.applied.has(node))) continue;

          void this.translateOnce(core).then((out) => {
            if (out === null) return;
            for (const node of nodes) this.apply(node, out);
          });
        }
      }
    });
  }
}

/**
 * Ask the browser for its on-device English→Nepali model.
 *
 * The caller must have checked `Translator.availability()` first: a browser can
 * expose the whole API and still not ship this one language pair, and that has
 * to be reported to the user rather than discovered as a silent no-op.
 */
export async function createTranslateSession(options: {
  sourceLanguage: string;
  targetLanguage: string;
  onProgress?: (progress: TranslateProgress) => void;
  signal?: AbortSignal;
}): Promise<TranslateSession> {
  const ctor = window.Translator;
  if (!ctor) {
    throw new Error('window.Translator is unavailable in this browser');
  }

  const translator = await ctor.create({
    sourceLanguage: options.sourceLanguage,
    targetLanguage: options.targetLanguage,
    monitor: (monitor) => {
      monitor.addEventListener('downloadprogress', (event) => {
        const total = Number(event.total);
        const loaded = Number(event.loaded);
        options.onProgress?.({
          phase: 'downloading',
          ratio: total > 0 ? Math.min(1, loaded / total) : null,
          done: 0,
          total,
        });
      });
    },
    signal: options.signal,
  });

  await translator.ready;
  return new Session(translator, options.onProgress, options.signal);
}
