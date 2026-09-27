'use client';

import {
  Check,
  Download,
  HardDriveDownload,
  Info,
  Languages,
  Loader2,
  RotateCcw,
  TriangleAlert,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocale } from '@/lib/i18n';
// Type-only: the hook itself is called by the switcher, which owns the session.
import type { BrowserTranslateApi } from '@/lib/use-browser-translate';

/**
 * Browser translation, as one control.
 *
 * This is the second localisation layer described in `lib/browser-translate.ts`:
 * the curated tables get the tuned chrome right, and the browser's own
 * on-device model gets the long-form prose they deliberately left in English.
 * It lives inside the language menu rather than in the header because the header
 * is already carrying a nav, a status badge, SOS and an account button, and
 * `language-switcher.tsx` already records what happens when one more control
 * squeezes that row.
 *
 * **Every unavailable state is stated, not swallowed.** No `window.Translator`,
 * no English→Nepali model, a refused model — each renders a sentence saying
 * which, because a button that quietly does nothing on Firefox is worse than a
 * button that is not there. The curated translation above it keeps working in
 * all of those cases, and the copy says so rather than leaving the person to
 * wonder whether the language changed.
 *
 * **"Left in English" is reported as a count, not hidden.** The gate in
 * `isAcceptable` is what makes this feature safe, and a feature that silently
 * leaves a fifth of a page in English looks broken. Saying so is the honest
 * version, and it matches how the switcher already states its own coverage.
 *
 * **Progress is announced, not decorated.** Model download can take a while on
 * the connections this app is built for, so the section below is a polite live
 * region, the bar carries the real number, and the button is `aria-busy` while
 * it runs.
 *
 * **`translate` is a required prop, for the same reason `ReliefAssistant` takes
 * `ai`.** This panel renders inside the menu, which unmounts when it closes, and
 * the hook destroys the model on unmount — so a control that owned the hook would
 * restore the whole page to English every time somebody closed the menu they had
 * just used to translate it. The session belongs to the switcher; this is only its
 * face. Two instances would also mean two models and two `previousLocale` guesses.
 */
export function TranslateControl({ translate }: { translate: BrowserTranslateApi }) {
  const { t } = useLocale();
  const { status, active, progress, result, error, toggle } = translate;

  const busy = status === 'downloading' || status === 'translating';
  const blocked = status === 'unsupported' || status === 'unavailable';

  return (
    // The section *is* the live region, rather than a visually hidden copy of
    // itself. An earlier draft rendered every state twice — once drawn, once in
    // an `sr-only` paragraph for screen readers — and two copies of one thing is
    // two things to keep in step: it had already shipped once where the hidden
    // copy announced the "no model installed" body next to the "this browser
    // cannot translate" title. `role="status"` is a polite live region, so each
    // state change is announced as it happens, and the sentence that gets read
    // is by construction the sentence that gets drawn.
    <div role="status" aria-live="polite" className="border-t border-navy-100 p-1.5">
      <div className="px-1.5 pb-1.5 pt-1">
        <p className="text-2xs font-bold uppercase tracking-[0.08em] text-navy-400">
          {t('translate.heading')}
        </p>
      </div>

      {blocked ? (
        <BlockedNote
          title={
            status === 'unsupported'
              ? t('translate.unsupported.title')
              : t('translate.unavailable.title')
          }
          body={
            status === 'unsupported'
              ? t('translate.unsupported.body')
              : t('translate.unavailable.body')
          }
        />
      ) : status === 'error' ? (
        // Retry, because a failure that the person cannot act on is a dead end:
        // the session lives in the switcher, so closing the menu no longer
        // resets it, and the only way out of this state would be a reload.
        <BlockedNote
          title={t('translate.error.title')}
          body={
            error === 'availability'
              ? t('translate.error.availability')
              : t('translate.error.unavailable')
          }
          tone="alert"
          action={{ label: t('btn.retry'), onClick: toggle }}
        />
      ) : active ? (
        <ActiveState result={result} onStop={toggle} />
      ) : (
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          aria-busy={busy || undefined}
          className={cn(
            'flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left no-tap-highlight',
            'transition-colors duration-200 hover:bg-navy-50',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dispatch-600',
            'disabled:pointer-events-none disabled:opacity-70',
          )}
        >
          <span
            className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-navy-100 text-navy-700"
            aria-hidden="true"
          >
            <Languages className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-navy-900">
              {busy ? (
                <>
                  <Loader2 className="me-1.5 inline size-3.5 animate-spin align-[-0.125em]" />
                  {status === 'downloading'
                    ? t('translate.downloading')
                    : t('translate.translating')}
                </>
              ) : (
                t('translate.action')
              )}
            </span>
            <span className="mt-0.5 block text-2xs leading-relaxed text-navy-500">
              {t('translate.actionBody')}
            </span>

            {busy && progress ? (
              <ProgressBar
                label={
                  status === 'downloading'
                    ? progress.ratio === null
                      ? t('translate.downloading')
                      : t('translate.downloadPercent', { pct: Math.round(progress.ratio * 100) })
                    : t('translate.progress', {
                        done: progress.done,
                        total: progress.total,
                      })
                }
                ratio={progress.ratio}
              />
            ) : null}
          </span>
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * States
 * ------------------------------------------------------------------ */

function ActiveState({
  result,
  onStop,
}: {
  result: { translated: number; kept: number; notSent: number } | null;
  onStop: () => void;
}) {
  const { t } = useLocale();
  return (
    <div className="px-1.5">
      <p className="flex items-start gap-2 rounded-lg bg-relief-50 px-3 py-2.5 text-relief-800 ring-1 ring-inset ring-relief-200">
        <Check className="mt-0.5 size-4 shrink-0" strokeWidth={3} aria-hidden="true" />
        <span className="min-w-0 text-2xs leading-relaxed">
          <span className="block text-sm font-bold">{t('translate.on.title')}</span>
          {result ? (
            <>
              {t('translate.on.counts', {
                translated: result.translated,
                kept: result.kept,
              })}
              {/*
                  "Not sent" is a budget, not a translation decision, so it is
                  reported as its own failure rather than folded into the count
                  of things that had no exact translation.
                */}
              {result.notSent > 0 ? ` ${t('translate.on.notSent', { n: result.notSent })}` : ''}
            </>
          ) : null}
          <span className="mt-1 flex items-center gap-1.5 text-navy-500">
            <HardDriveDownload className="size-3.5 shrink-0" aria-hidden="true" />
            {t('translate.on.device')}
          </span>
        </span>
      </p>

      <button
        type="button"
        onClick={onStop}
        className={cn(
          'mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold text-navy-600 no-tap-highlight',
          'transition-colors duration-200 hover:bg-navy-50 hover:text-navy-900',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dispatch-600',
        )}
      >
        <RotateCcw className="size-3.5 shrink-0 text-navy-400" aria-hidden="true" />
        {t('translate.stop')}
      </button>
    </div>
  );
}

/**
 * A state the button cannot enter, stated as a sentence.
 *
 * `alert` is only for a failure — a browser that *could* translate and did not.
 * A browser that never had the API is a `muted` note, not a warning: nothing
 * broke, and colouring it red would read as the page having failed.
 *
 * `action` appears only where trying again could plausibly work. The two
 * `blocked` states have nothing to retry — a browser without the API will not
 * grow one during this visit — so they get a sentence and no false affordance.
 */
function BlockedNote({
  title,
  body,
  tone = 'muted',
  action,
}: {
  title: string;
  body: string;
  tone?: 'muted' | 'alert';
  action?: { label: string; onClick: () => void };
}) {
  const alert = tone === 'alert';
  const Icon = alert ? TriangleAlert : Info;
  return (
    <div className="px-1.5">
      <p
        className={cn(
          'flex items-start gap-2 rounded-lg px-3 py-2.5 ring-1 ring-inset',
          alert ? 'bg-alert-50 text-alert-800 ring-alert-200' : 'bg-navy-50 text-navy-600 ring-navy-200/60',
        )}
      >
        <Icon
          className={cn('mt-0.5 size-4 shrink-0', !alert && 'text-navy-400')}
          aria-hidden="true"
        />
        <span className="min-w-0 text-2xs leading-relaxed">
          <span className={cn('block text-sm font-bold', !alert && 'text-navy-800')}>{title}</span>
          {body}
        </span>
      </p>

      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className={cn(
            'mt-1.5 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold no-tap-highlight',
            'transition-colors duration-200',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dispatch-600',
            alert
              ? 'text-alert-800 hover:bg-alert-100'
              : 'text-navy-600 hover:bg-navy-50 hover:text-navy-900',
          )}
        >
          <RotateCcw className="size-3.5 shrink-0" aria-hidden="true" />
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

function ProgressBar({ label, ratio }: { label: string; ratio: number | null }) {
  // `ratio` is null while the browser has not reported a model size, which is a
  // real state on some builds and must read as "working" rather than "stuck at
  // 0%". An indeterminate bar is animated, and the `prefers-reduced-motion`
  // override in `globals.css` flattens it.
  const value = ratio === null ? null : Math.round(ratio * 100);
  return (
    <span className="mt-2 block">
      <span className="mb-1 flex items-center gap-1.5 text-2xs font-semibold text-navy-500">
        <Download className="size-3 shrink-0" aria-hidden="true" />
        {label}
      </span>
      <span
        // Deliberately not `aria-hidden`. The bar is drawn inside the button that
        // started the work, and it is the only place the number is shown, so the
        // live region above can only announce what is already here.
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        {...(value === null ? {} : { 'aria-valuenow': value })}
        className="block h-1.5 w-full overflow-hidden rounded-full bg-navy-100"
      >
        <span
          className={cn(
            'block h-full rounded-full bg-dispatch-500 transition-[width] duration-300 ease-calm',
            value === null && 'w-1/3 animate-pulse',
          )}
          style={value === null ? undefined : { width: `${value}%` }}
        />
      </span>
    </span>
  );
}
