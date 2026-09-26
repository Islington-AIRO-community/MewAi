# AGENTS.md

Next.js 14 App Router demo UI for a post-disaster relief platform. Front-end only:
no backend, no database, no network calls. `README.md` is the product/design
reference and is mostly accurate — but it gets the component architecture wrong
(see below). Trust this file on that point.

## Commands

```bash
npm run dev         # localhost:3000
npm run typecheck   # tsc --noEmit
npm run lint        # next lint (next/core-web-vitals)
npm run build       # runs lint + typecheck, then prerenders
npm start           # serve the build (needs a prior `npm run build`)
```

Node 20+ (developed on 22). There is **no test suite and no test runner** — no
jest/vitest/playwright/cypress is installed and there is no `test` script. Don't
add a `npm test` invocation or assume fixtures exist. The only automated
verification is `typecheck` + `lint` + `build`; all three pass clean at HEAD, so
treat any new output from them as a regression you introduced.

`build` already runs lint and typecheck, so run `build` alone as the full gate.

## Architecture: nearly everything is a client component

The README says "routes stay server components, interactive things are client
islands." That is true for exactly one route. In reality:

- **Server components:** only `app/layout.tsx` and `app/chat/page.tsx`.
- **Everything else is `'use client'`** — `app/page.tsx`, `login`, `dashboard`,
  `reports`, `reports/[id]`, `resources`, all of `components/**`, `lib/store.tsx`,
  and `lib/hooks.ts`.

Consequences an agent will trip over:

- You **cannot** export `metadata`, `generateMetadata`, or `generateStaticParams`
  from any of those pages. Only `app/layout.tsx` and `app/chat/page.tsx` export
  `metadata` today. To add per-route metadata, the page must first lose its
  `'use client'` directive.
- Route params come from `useParams()`, not props. `/reports/[id]` is the only
  dynamic route (`ƒ` in build output) because there is no `generateStaticParams`.
- A missing report renders an **in-page "Report not found"** view, not
  `notFound()` — the page can't call it. There is no custom `not-found.tsx`, so
  only truly unmatched routes hit the Next.js default 404.
- Don't add a `/sos` route. SOS is a single `SosDialog` driven by shell state,
  opened from the header, footer, mobile strip, and assistant. A route would be
  a dead link.

`app/chat` is the one deliberate server/client split: `page.tsx` exports
`metadata` and wraps `chat-experience.tsx` in `<Suspense>` because the island
calls `useSearchParams()`. Preserve that boundary if you touch either file.

## State: in-memory only, and it resets on refresh

`lib/store.tsx` exports `AppProvider` / `useApp`, mounted in
`components/layout/app-shell.tsx` (alongside `ToastProvider`). It is the single
source of truth: `signIn`/`signOut`, `sendMessage`, `confirmActionCard`,
`dismissActionCard`, `advanceStage`, `triggerSos`, `getReport`.

- All state is plain `useState`. **There is no persistence.** A hard refresh or a
  new tab resets the session user, the chat transcript, and every report created
  in-session. Client-side `<Link>` navigation preserves state; a reload does not.
- Consequence: create a report via SOS, hard-refresh its `/reports/[id]` URL, and
  you get "Report not found" — the store came back empty. This is expected
  behavior, not a bug to chase.
- `lib/hooks.ts` exports `useLocalStorage` and `useIsMobile`, and **both are dead
  code — zero call sites.** Don't assume state already persists, and don't assume
  a mobile hook is in use. Wire them up deliberately or leave them.
- Report ids: mock data is `'417'`–`'425'`; new reports get bare numeric ids from
  `nextReportSeq`, which starts at **426** and increments. `reportCodeFromId` in
  `lib/utils.ts` renders `'426'` as `RPT-2026-0426`. Bump the seed if you add mock
  reports above 425 or you will get duplicate ids.
- Mock data and every taxonomy (categories, priorities + SLA minutes, stages,
  departments, status styles) live in `lib/mock-data.ts` and `lib/types.ts`.
  Icons are stored as components in those taxonomies.

## Time is frozen — this causes hydration bugs

`lib/time.ts` exports `DEMO_NOW = 2026-09-26T06:00:00Z`. Every human-facing time
string resolves against it. `relativeTime()` and `greetingFor()` default to that
anchor.

- **Never call `new Date()` or `Date.now()` to render a time on a statically
  prerendered route.** Routes are prerendered at build time and hydrate much
  later, so a real clock makes server and client text diverge across a
  relative-time bucket boundary → React hydration mismatch. This has already
  broken three routes (#425, #418, #423).
- The sanctioned exceptions are the `nowIso()` calls in `lib/store.tsx`, which
  stamp objects created *after* hydration and only ever render client-side.
- If you add a time display, thread the anchor through instead of defaulting to
  the real clock.

## Styling: token-driven, and the content globs are narrow

`tailwind.config.ts` defines six semantic ramps — `navy`, `emergency`, `alert`,
`dispatch`, `relief`, plus `surface`/`ink` — all 50–900, plus custom `spacing`
(`4.5`, `5.5`, `13`), `text-2xs` (11px), radii `4xl`/`5xl`, named shadows
(`xs`, `soft`, `card`, `lift`, `ring`, `glow-rose`, `glow-navy`, `inset-top`),
keyframes, and easings `out-expo` / `calm`.

- **There is not a single arbitrary hex value in the codebase.** Everything is a
  token. Keep it that way — the colour semantics are an accessibility contract,
  not decoration (see below).
- `content` globs are only `./app`, `./components`, `./lib`. **A new top-level
  source directory will be silently purged** by Tailwind unless you add it there.
- Hand-written utility classes live in `app/globals.css` under
  `@layer components` / `@layer utilities`, not in the Tailwind config:
  `.nums` (tabular figures), `.surface-grid`, `.surface-grid-dark`, `.glass`,
  `.glass-dark`, `.stripe-alert`, `.stripe-critical`, `.edge-critical`,
  `.no-print`, `.no-tap-highlight`, `.safe-bottom`, `.skip-link`,
  `.radial-fade-navy`, `.grain`. Rewriting `globals.css` silently breaks many
  components.
- `globals.css` also owns the global `:focus-visible` ring, the
  `prefers-reduced-motion` override, `forced-colors`, and `@media print`
  (`.no-print` hides all chrome). These are load-bearing, not boilerplate.
- `darkMode: 'class'` is configured but the app is light-only — nothing toggles
  `.dark`. Don't reach for dark-mode variants expecting them to activate.
- Path alias is `@/*` → repo root (`"./*"`). There is no `src/`. Use
  `@/lib/types`, `@/components/ui/button`.

## Regressions that have already been fixed — don't reintroduce

1. **`asChild` must not rewrite `children`.** `components/ui/slot.tsx` merges
   className and refs into the cloned child and stops. Reassigning the clone's
   `children` nests anchors inside anchors, which is invalid HTML and caused a
   site-wide hydration failure.
2. **`Button` is `whitespace-nowrap` by default.** Long labels are unshrinkable;
   inside a grid you must pass `whitespace-normal min-w-0` or the layout overflows
   (this broke 7 category tiles at 1280–1536px).
3. **Fixed bottom furniture shares height tokens.** The mobile tab bar uses
   `var(--tabbar-h)` and the SOS strip is offset by
   `calc(env(safe-area-inset-bottom) + var(--tabbar-h))`. Never hardcode a rem
   offset for anything docked above the tab bar.
4. **The floating assistant is hidden below `sm` by its mount wrapper, not by the
   component.** In `components/layout/app-shell.tsx` it is wrapped in
   `hidden ... sm:flex` at `bottom-[calc(env(safe-area-inset-bottom)+7rem)]`.
   `relief-assistant.tsx` itself has no `sm:hidden` — the launcher renders in a
   bare fragment, so don't go looking for the gate there or add a second,
   conflicting one. Its panel is height-capped
   (`sm:max-h-[calc(100dvh-8.75rem)]`, `-7rem` when expanded) with internal
   scrolling; removing the cap grew the panel off-screen (`top: -1686px`).
5. **Watch for stray dev servers.** A leftover `next dev` rewrites `.next`
   underneath a running `next start` and produces `ChunkLoadError` and 400/404
   chunk errors that look like app bugs. Both modes report as
   `next-server (v14.2.35)`, so `pkill -f "next dev"` will **not** match. Use
   `ps -eo pid,args | grep next`, kill by PID, then `rm -rf .next && npm run build`.

## Accessibility invariants (convention-only, nothing enforces them)

There is no a11y test, so these break silently:

- Colour **never** carries meaning alone — always pair with an icon and a text
  label. `emergency-*` = life at risk right now, `relief-*` = done.
- One `<h1>` per route, no heading-level jumps. `ReportCard` takes a `titleTag`
  prop for exactly this reason (the landing page needs `h1 → p`, not `h1 → h3`).
- Never remove focus rings for keyboard users; the global `:focus-visible` ring
  handles this. Cards use `focus-within:` because the title link is stretched.
- Interactive targets ≥44px, inputs ≥16px (prevents iOS zoom-on-focus), and zoom
  must stay enabled (`maximumScale: 5` in the root viewport).
- `aria-live` for voice state (`assertive` while listening), `role="status"` for
  toasts, focus trapped in dialogs, `Escape` closes overlays.
- `TabPanel` renders nothing unless active, keeping inactive panels out of the
  a11y tree — don't make it always-mounted.
- Report pages must stay printable; new chrome needs `no-print`.

## Environment

`.env` exists in the working tree but is **gitignored and untracked, is not valid
dotenv** (a single bare token, no `KEY=value`), and **nothing in the app reads
`process.env` or any `NEXT_PUBLIC_*` var**. There is no env-driven config today.
If you introduce one, write a proper `KEY=value` and read it explicitly — don't
assume the existing file is wired up. Don't commit it.

## Performance invariants

No images, icon fonts, chart libraries, or map tiles anywhere — avatars are inline
SVG data URIs, the "map" is pure CSS/SVG, sparklines are inline SVG, the Google
mark is inline SVG. `lucide-react` and `framer-motion` are in
`next.config.js → experimental.optimizePackageImports`, so only used icons and
motion primitives bundle. Shared First Load JS is 87.3 kB. Keep it that way; a
real image or chart dependency is a visible regression.
