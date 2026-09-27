'use client';

import * as React from 'react';
import { Check, ChevronDown, Languages } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDismissable, useFocusTrap } from '@/lib/hooks';
import { LOCALES, useLocale, type Locale } from '@/lib/i18n';
import { useBrowserTranslate } from '@/lib/use-browser-translate';
import { TranslateControl } from './translate-control';

/**
 * Language switcher.
 *
 * A menu rather than a toggle: two languages today is a pair, but the menu is
 * the shape that survives a third, and it is the only version that can say
 * *which* language is active without a second tap.
 *
 * **It states its own coverage.** A screen that is 80% Nepali and silently
 * looks like a finished translation is the failure mode worth designing against
 * — so the current option carries the real number ("Nepali · 78% translated"),
 * computed from the tables rather than asserted. A partial translation shown as
 * a complete one is how someone ends up reading a paragraph the app never
 * translated while the interface insists it did.
 *
 * Compact enough for the header at every width: icon plus the short code, with
 * the full name for assistive tech. Below `sm` the label collapses to the icon
 * so it cannot push the SOS button off the row.
 *
 * The menu has two sections. The locales are the curated translation — the tuned
 * chrome and the short labels, reviewed. `TranslateControl` is the second layer,
 * which covers the long-form prose those tables deliberately leave in English
 * using the browser's own on-device model.
 */
export function LanguageSwitcher() {
  const { locale, setLocale, t } = useLocale();
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);
  const menuRef = useDismissable<HTMLDivElement>(open, close);
  const trapRef = useFocusTrap<HTMLDivElement>(open);

  /**
   * The on-device translation session is owned here, not inside the menu.
   *
   * `useBrowserTranslate` destroys the model and restores every text node on
   * unmount, so a session owned by the panel below would end the moment the menu
   * closed — clicking away from a control that had just translated the page would
   * put the page back into English. The menu is a view of a session that outlives
   * it, so the hook sits at the lifetime of the header.
   */
  const translate = useBrowserTranslate();

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        // Return focus to the trigger, or the menu closes with focus on <body>
        // and keyboard users restart at the top of the page.
        document.getElementById('language-switcher')?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  const current = LOCALES.find((l) => l.id === locale) ?? LOCALES[0];

  return (
    <div className="relative shrink-0" ref={menuRef}>
      <button
        id="language-switcher"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`${t('nav.lang.switch')} — ${current.label}`}
        className={cn(
          'inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-2 sm:px-2.5 no-tap-highlight',
          'border border-navy-200 bg-white text-navy-700 shadow-xs',
          'transition-colors duration-200 hover:border-navy-300 hover:bg-navy-50 hover:text-navy-900',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dispatch-600 focus-visible:ring-offset-2',
        )}
      >
        <Languages className="size-4 shrink-0" aria-hidden="true" />
        <span
          className="text-xs font-bold uppercase tracking-wide"
          // Devanagari in an uppercase-transformed slot renders fine, but the
          // native name is the point here, so it gets its own lang for
          // pronunciation and no Latin case-folding.
          lang={locale === 'ne' ? 'ne' : 'en'}
        >
          {locale === 'ne' ? 'ने' : 'EN'}
        </span>
        <ChevronDown
          className={cn(
            'hidden size-3.5 text-navy-400 transition-transform duration-200 sm:block',
            open && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          ref={trapRef}
          role="menu"
          aria-label={t('nav.lang')}
          // `w-72` rather than `w-64`: the translation section below states what
          // it translated and what it left in English, and at 256px that wraps
          // into four lines. The account menu is already this width, so the two
          // dropdowns line up.
          className="absolute right-0 top-[calc(100%+0.5rem)] w-72 animate-slide-up overflow-hidden rounded-2xl border border-navy-200 bg-white shadow-lift"
        >
          <p className="border-b border-navy-100 px-4 py-3 text-2xs font-bold uppercase tracking-[0.08em] text-navy-400">
            {t('nav.lang')}
          </p>
          <div className="p-1.5">
            {LOCALES.map((option) => (
              <LanguageOption
                key={option.id}
                option={option}
                active={option.id === locale}
                onSelect={() => {
                  setLocale(option.id as Locale);
                  close();
                  document.getElementById('language-switcher')?.focus();
                }}
              />
            ))}
          </div>

          {/*
            The second localisation layer, as one more section of this menu
            rather than a second control in the header. Choosing a language is
            choosing the curated tables; this is what covers the prose they
            deliberately left in English, and it lives here because the header
            row has no room to grow.
          */}
          <TranslateControl translate={translate} />
        </div>
      )}
    </div>
  );
}

function LanguageOption({
  option,
  active,
  onSelect,
}: {
  option: { id: Locale; label: string; native: string };
  active: boolean;
  onSelect: () => void;
}) {
  const { coverage, t } = useLocale();
  const pct = Math.round((coverage.translated / coverage.total) * 100);
  const partial = pct < 100;

  return (
    <button
      role="menuitemradio"
      type="button"
      aria-checked={active}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left no-tap-highlight',
        active ? 'bg-navy-100/70' : 'hover:bg-navy-50',
      )}
    >
      <span
        className={cn(
          'grid size-4 shrink-0 place-items-center rounded-full border',
          active ? 'border-dispatch-600 bg-dispatch-600 text-white' : 'border-navy-300',
        )}
        aria-hidden="true"
      >
        {active && <Check className="size-3" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        {/* Each name in its own script, each with its own lang, so a reader who
            cannot read the other script can still find their language. */}
        <span className="block text-sm font-bold text-navy-900" lang={option.id}>
          {option.native}
        </span>
        <span className="block text-2xs text-navy-500">
          {option.label}
          {active && partial && (
            <span className="text-navy-400">
              {' · '}
              {pct}% {t('nav.lang.partial')}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
