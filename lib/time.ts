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
