/**
 * A single, fixed "now" for the whole demo.
 *
 * Every human-facing time string (relative times, greetings, "updated" labels)
 * must resolve against this anchor rather than `new Date()`. Static routes are
 * prerendered at build time and hydrated much later, so a real clock would let
 * the server text ("2 hours ago") and the client text ("3 hours ago") drift
 * apart the moment a bucket boundary is crossed — which React reports as a
 * hydration mismatch.
 */
export const DEMO_NOW = new Date('2026-09-26T06:00:00.000Z');

/**
 * Time-of-day greeting, as a translation key.
 *
 * The hour boundary is deliberately kept here rather than in the dictionary: it
 * is a fact about the demo clock, while the words for it are chrome. Returning a
 * key means the call site cannot accidentally render an English greeting into a
 * Nepali screen, which is the failure this module exists to prevent elsewhere.
 */
export function greetingKeyFor(now: Date = DEMO_NOW): string {
  const h = now.getHours();
  if (h < 5) return 'time.greeting.awake';
  if (h < 12) return 'time.greeting.morning';
  if (h < 18) return 'time.greeting.afternoon';
  return 'time.greeting.evening';
}

/**
 * Format a **server-stamped** timestamp for display.
 *
 * Only for values the database produced — `relief_tickets.created_at`, a ticket
 * message. Those are safe to read with `new Date()` because they do not exist
 * until a client-side fetch resolves, so they are never part of a first paint
 * and can never disagree with the prerendered HTML.
 *
 * This is not a general-purpose formatter and must not be pointed at a
 * `DEMO_NOW`-relative value; see the note at the top of this file for why that
 * distinction is load-bearing rather than stylistic.
 */
export function formatDateTime(iso: string, locale = 'en-US'): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  // `numberingSystem: 'latn'` and not a bare locale tag — see the digits note in
  // `lib/i18n-strings.ts`. Latin digits in both locales, deliberately.
  return parsed.toLocaleString(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    numberingSystem: 'latn',
  });
}
