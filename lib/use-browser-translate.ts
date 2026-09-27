'use client';

import * as React from 'react';
import { useLocale } from './i18n';
// Type-only, so it is erased at compile time and does not pull the engine — and
// its taxonomy imports — into the initial bundle. The engine arrives through the
// dynamic `import()` inside `run()`.
import type { TranslateResult, TranslateSession } from './browser-translate';

/**
 * The browser-translation layer, wired to the curated locale.
 *
 * **It is one control, not two.** Turning the page Nepali does two things: it
 * sets the curated locale, which covers the tuned chrome and the short labels
 * written to a layout budget, and it runs the browser's own on-device model over
 * whatever the tables deliberately left in English. Neither layer is sufficient
 * alone — the tables are partial by design, and the model must never be trusted
 * with button copy or a phone number — so the button owns both and undoes both.
 *
 * **Nothing here runs during render.** These routes are statically prerendered
 * and hydrate much later, so reading `localStorage` or `window.Translator` in
 * the first pass would make the server HTML and the first client render
 * disagree. Support, the stored choice and the model itself are all resolved in
 * effects, after mount — the same trade `lib/i18n.tsx` makes for the same
 * reason.
 *
 * **Navigation needs no re-run.** The engine's `MutationObserver` picks up the
 * new subtree when a route swaps `<main>`, so the page stays translated across
 * client-side navigation without destroying and rebuilding the model — and
 * without an English flash — on every link click.
 */

const STORAGE_KEY = 'flare.browserTranslate';

const SOURCE_LANGUAGE = 'en';
const TARGET_LANGUAGE = 'ne';

export type BrowserTranslateStatus =
  /** Supported, not run yet. */
  | 'idle'
  /** No on-device translator in this browser at all. */
  | 'unsupported'
  /** The API exists, but this browser ships no English→Nepali model. */
  | 'unavailable'
  /** Fetching the model. Nothing has been sent anywhere. */
  | 'downloading'
  /** Walking the page. */
  | 'translating'
  /** Both layers are applied. */
  | 'on'
  /** The browser refused, or the model could not be created. */
  | 'error';

export type BrowserTranslateError = 'availability' | 'unavailable';

export interface BrowserTranslateProgress {
  ratio: number | null;
  done: number;
  total: number;
}

export interface BrowserTranslateApi {
  status: BrowserTranslateStatus;
  /** True when the curated locale and the model layer are both applied. */
  active: boolean;
  progress: BrowserTranslateProgress | null;
  /** Counts from the last completed run, or `null` before the first one. */
  result: TranslateResult | null;
  /** Why the last attempt failed, for the call site to turn into a sentence. */
  error: BrowserTranslateError | null;
  toggle: () => void;
}

/**
 * Read without importing the engine, so a browser that cannot translate never
 * downloads it. The engine is a dynamically imported chunk, so the capability
 * check has to be able to answer from a one-line `typeof`.
 */
function translatorCtor(): TranslatorConstructor | null {
  if (typeof window === 'undefined') return null;
  return window.Translator ?? null;
}

export function useBrowserTranslate(): BrowserTranslateApi {
  const { locale, setLocale } = useLocale();

  const [status, setStatus] = React.useState<BrowserTranslateStatus>('idle');
  const [active, setActive] = React.useState(false);
  const [progress, setProgress] = React.useState<BrowserTranslateProgress | null>(null);
  const [result, setResult] = React.useState<TranslateResult | null>(null);
  const [error, setError] = React.useState<BrowserTranslateError | null>(null);

  const sessionRef = React.useRef<TranslateSession | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const activeRef = React.useRef(false);

  /**
   * Refs for the two values `run` would otherwise have to depend on.
   *
   * `locale` is the important one: `run` *sets* the locale, so depending on it
   * would make the mount effect re-run itself, re-apply, and loop. Reading it
   * from a ref breaks that cycle. Assigning a ref during render is not
   * concurrent-safe and is not meant to be — this is the same pattern
   * `components/layout/app-shell.tsx` uses for `tRef`.
   */
  const localeRef = React.useRef(locale);
  localeRef.current = locale;

  /**
   * What the curated locale was before we took it over, so turning the layer off
   * restores the person's own choice instead of assuming English. Someone who
   * picked Nepali from the switcher and *then* turned this off should be left
   * with the curated translation they asked for.
   */
  const previousLocaleRef = React.useRef(locale);

  const teardown = React.useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    sessionRef.current?.destroy();
    sessionRef.current = null;
    activeRef.current = false;
    setActive(false);
  }, []);

  const run = React.useCallback(async () => {
    teardown();
    setError(null);
    setProgress(null);
    setResult(null);

    const ctor = translatorCtor();
    if (!ctor) {
      setStatus('unsupported');
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    let availability: TranslatorAvailability;
    try {
      availability = await ctor.availability({
        sourceLanguage: SOURCE_LANGUAGE,
        targetLanguage: TARGET_LANGUAGE,
      });
    } catch {
      if (controller.signal.aborted) return;
      setStatus('error');
      setError('availability');
      return;
    }

    // A browser with the whole API can still not ship this language pair. That
    // is an honest answer to report, not an error worth retrying.
    if (controller.signal.aborted) return;
    if (availability === 'unavailable') {
      setStatus('unavailable');
      return;
    }

    previousLocaleRef.current = localeRef.current;
    setLocale(TARGET_LANGUAGE);
    setStatus(availability === 'downloading' ? 'downloading' : 'translating');

    try {
      const { createTranslateSession } = await import('./browser-translate');
      const session = await createTranslateSession({
        sourceLanguage: SOURCE_LANGUAGE,
        targetLanguage: TARGET_LANGUAGE,
        signal: controller.signal,
        onProgress: (next) => {
          if (controller.signal.aborted) return;
          setProgress({ ratio: next.ratio, done: next.done, total: next.total });
          if (next.phase === 'downloading') setStatus('downloading');
        },
      });

      if (controller.signal.aborted) {
        session.destroy();
        return;
      }
      sessionRef.current = session;
      activeRef.current = true;
      setActive(true);

      const counts = await session.translate(document.body);
      if (controller.signal.aborted) return;

      setResult(counts);
      setProgress(null);
      setStatus('on');
      try {
        window.localStorage.setItem(STORAGE_KEY, 'on');
      } catch {
        // The preference lasts for this visit only, which is fine.
      }
    } catch {
      if (controller.signal.aborted) return;
      teardown();
      setLocale(previousLocaleRef.current);
      setStatus('error');
      setError('unavailable');
    }
  }, [setLocale, teardown]);

  const stop = React.useCallback(() => {
    teardown();
    setLocale(previousLocaleRef.current);
    setProgress(null);
    setStatus('idle');
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Nothing to undo.
    }
  }, [setLocale, teardown]);

  const toggle = React.useCallback(() => {
    // `activeRef` rather than `active`: the click that turns the layer off has to
    // see the state the click before it set, and `active` is one render behind.
    if (activeRef.current) stop();
    else void run();
  }, [run, stop]);

  // After mount only — see the note on hydration at the top of this file.
  React.useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      stored = null;
    }

    // `run()` probes for itself, so the stored case must not also probe — it would
    // be the same question asked twice, and the mount probe's answer would be
    // overwritten a moment later regardless.
    if (stored === 'on') {
      void run();
      return;
    }

    const ctor = translatorCtor();
    if (!ctor) {
      setStatus('unsupported');
      return;
    }

    // Ask what the browser has, so the menu opens knowing whether to offer the
    // button or to explain itself. A failure here is not worth surfacing: the
    // real probe is inside `run()`, and somebody who has not pressed anything yet
    // has not been refused anything.
    void ctor
      .availability({ sourceLanguage: SOURCE_LANGUAGE, targetLanguage: TARGET_LANGUAGE })
      .then((availability) => {
        setStatus(availability === 'unavailable' ? 'unavailable' : 'idle');
      })
      .catch(() => setStatus('idle'));
    // `run` and `teardown` are stable, so this is a mount-time effect.
  }, [run, teardown]);

  // Free the model when the control that owns it goes away, so a closed tab is
  // not holding a downloaded language model open for the rest of the session.
  React.useEffect(() => teardown, [teardown]);

  return { status, active, progress, result, error, toggle };
}
