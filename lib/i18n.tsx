'use client';

import * as React from 'react';
import {
  EN,
  NE,
  NE_TABLES,
  localeCoverage,
  type Locale,
  type Table,
} from './i18n-strings';

/**
 * Client-side localisation. English and Nepali, one provider, no new dependency.
 *
 * **Why client-side and not route-prefixed (`/ne/...`).** A locale prefix means
 * a rewrite or a redirect in front of every route, which fights three things
 * this app is built on: the `middleware.ts` matcher (`/reports/:path*` and
 * friends would all need a second copy), the static prerender of every route,
 * and the `<html lang>` a screen reader reads. The language is a *preference of
 * the person on this device*, not a property of the resource, so it belongs in
 * local storage and in the DOM, not in the URL.
 *
 * **Why the first render is always English.** The routes are prerendered at
 * build time and hydrated much later, so reading `localStorage` during the first
 * render would make the server HTML English and the first client pass Nepali —
 * a hydration mismatch on every route, which this app has been bitten by three
 * times already. So the stored choice is applied in an effect, after mount. The
 * same trade the session user makes, and for the same reason: rendering nothing
 * while loading was tried here and is worse than a one-frame switch.
 */

// `Locale` is declared in the tables module (which needs it for coverage and
// must not import React) and re-exported here, so components have one import.
export type { Locale } from './i18n-strings';

export interface LocaleOption {
  id: Locale;
  /** Name in English, for the code switch and for `aria-label`. */
  label: string;
  /** Name as written by its own speakers. */
  native: string;
}

export const LOCALES: LocaleOption[] = [
  { id: 'en', label: 'English', native: 'English' },
  { id: 'ne', label: 'Nepali', native: 'नेपाली' },
];

const STORAGE_KEY = 'flare.locale';

export type Vars = Record<string, string | number>;

export interface LocaleValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  /** A sentence from the tables. Falls back to English, then to the key. */
  t: (key: string, vars?: Vars) => string;
  /** A taxonomy label, translated in place of the object's own English. */
  label: (table: Table, id: string, english: string) => string;
  /** How much of the UI this locale actually covers. */
  coverage: { translated: number; total: number };
}

const LocaleContext = React.createContext<LocaleValue | null>(null);

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/** Exported for the switcher, which needs to render both names at once. */
export function translate(
  locale: Locale,
  key: string,
  vars?: Vars,
): string {
  let value = (locale === 'ne' ? NE : EN)[key];
  if (value === undefined && locale !== 'en') value = EN[key];
  if (value === undefined) {
    // A missing key is a programming error, not a runtime condition. Left
    // visible in dev so it is caught here rather than as "vulnerability.report.
    // vulnerability" on a triage screen.
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[i18n] missing key: ${key}`);
    }
    return key;
  }
  return interpolate(value, vars);
}

export function translateLabel(locale: Locale, table: Table, id: string, english: string): string {
  if (locale === 'en') return english;
  return NE_TABLES[table][id] ?? english;
}

export function useLocale(): LocaleValue {
  const ctx = React.useContext(LocaleContext);
  if (!ctx) {
    // Same contract as `useSession` and `useApp`: throw rather than degrade, so a
    // missing provider is loud and immediate instead of silently English.
    throw new Error('useLocale must be used inside <LocaleProvider>');
  }
  return ctx;
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = React.useState<Locale>('en');

  // After mount only. See the note on hydration above.
  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'ne') setLocaleState('ne');
    } catch {
      // Private mode, or storage disabled. English is a fine answer.
    }
  }, []);

  const setLocale = React.useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Preference lasts for this visit only.
    }
  }, []);

  // A screen reader switches voice and pronunciation off the document language,
  // so this has to be the real attribute rather than a `lang` on one wrapper.
  React.useEffect(() => {
    document.documentElement.lang = locale === 'ne' ? 'ne' : 'en';
  }, [locale]);

  const value = React.useMemo<LocaleValue>(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => translate(locale, key, vars),
      label: (table, id, english) => translateLabel(locale, table, id, english),
      coverage: localeCoverage(locale),
    }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
