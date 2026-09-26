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

/** Time-of-day greeting derived from the demo clock (never the real one). */
export function greetingFor(now: Date = DEMO_NOW): string {
  const h = now.getHours();
  if (h < 5) return 'Still awake';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
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
export function formatDateTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}
