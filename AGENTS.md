# AGENTS.md

Next.js 14 App Router UI for a post-disaster relief platform, plus a real
Gemini-backed AI intake service in `ai-backend/`. `README.md` is the
product/design reference and is mostly accurate — but it gets the component
architecture wrong (see below). Trust this file on that point.

## Commands

```bash
npm run dev         # localhost:3000
npm run typecheck   # tsc --noEmit
npm run lint        # next lint (next/core-web-vitals)
npm run build       # runs lint + typecheck, then prerenders
npm start           # serve the build (needs a prior `npm run build`)
```

Node 20+ (developed on 22). There is **no JS test suite and no JS test runner** —
no jest/vitest/playwright/cypress is installed and there is no `test` script.
Don't add an `npm test` invocation or assume fixtures exist. The only automated
verification of the front end is `typecheck` + `lint` + `build`; all three pass
clean, so treat any new output from them as a regression you introduced.

`build` already runs lint and typecheck, so run `build` alone as the full gate.

The Python service is separate and **does** have tests:

```bash
cd ai-backend
.venv/bin/python -m pytest app/tests -q   # 43 tests, no model calls, no quota
./dev.sh                                 # venv + deps + uvicorn on :8000
docker compose up -d db                  # Postgres
```

## Architecture: nearly everything is a client component

The README says "routes stay server components, interactive things are client
islands." That is true for exactly one route. In reality:

- **Server components:** only `app/layout.tsx` and `app/chat/page.tsx`, plus the
  route handlers under `app/api/ai/` and `app/api/auth/`.
- **Everything else is `'use client'`** — `app/page.tsx`, `login`, `dashboard`,
  `reports`, `reports/[id]`, `resources`, all of `components/**`, `lib/store.tsx`,
  `lib/hooks.ts`, `lib/use-ai-chat.ts`, and `lib/ai-client.ts`. The exceptions in
  `lib/` are `lib/auth.ts` (server-only — never import from a client component),
  `lib/session-user.ts` (isomorphic: a pure function, no React) and
  `lib/next-auth.d.ts` (ambient types, no runtime).
- `middleware.ts` is neither — it runs on the edge before any route renders.

Consequences an agent will trip over:

- You **cannot** export `metadata`, `generateMetadata`, or `generateStaticParams`
  from any of those pages. Only `app/layout.tsx` and `app/chat/page.tsx` export
  `metadata` today. To add per-route metadata, the page must first lose its
  `'use client'` directive.
- Route params come from `useParams()`, not props. `/reports/[id]` is the only
  dynamic page route (`ƒ` in build output) because there is no
  `generateStaticParams`.
- A missing report renders an **in-page "Report not found"** view, not
  `notFound()` — the page can't call it. There is no custom `not-found.tsx`, so
  only truly unmatched routes hit the Next.js default 404.
- Don't add a `/sos` route. SOS is a single `SosDialog` driven by shell state,
  opened from the header, footer, mobile strip, and assistant. A route would be
  a dead link.

`app/chat` is the one deliberate server/client split: `page.tsx` exports
`metadata` and wraps `chat-experience.tsx` in `<Suspense>` because the island
calls `useSearchParams()`. Preserve that boundary if you touch either file.

## Auth: Google OAuth, session only

next-auth v4 (`next-auth@4.24.15`). **Not** Auth.js v5 — the `next` dist-tag
(4.0.0-next.26) targets Next 15, and this is Next 14.2.35.

```
browser ──► /login ──► /api/auth/signin/google ──► Google consent screen
                     ◄── /api/auth/callback/google ──► session cookie (httpOnly)
```

- `lib/auth.ts` is the `authOptions` and is **server-only**. Do not import it
  from a client component. The client uses `next-auth/react` and the `user` the
  store derives from it.
- `app/api/auth/[...nextauth]/route.ts` is the handshake, `runtime = 'nodejs'`
  because v4 signs JWTs with Node crypto. It cannot run on the edge.
- `lib/session-user.ts` holds `sessionToUser()`, the projection of a session
  onto `SessionUser`. It is a pure function in its own module **on purpose** —
  in `lib/store.tsx` it would be welded to React and untestable without a
  bundler.

Three things an agent will get wrong here:

1. **`SessionProvider` must be outside `AppProvider`.** `useSession` *throws*
   rather than degrading when it has no provider (see `next-auth/react`'s
   `SessionContext` check), and `AppProvider` calls it — so an `AppProvider`
   rendered without one takes down every route at once. They are nested in
   `components/layout/app-shell.tsx`.
2. **The store has no `signIn`/`signOut`.** `user` is *derived* from the session
   by `sessionToUser`. The old setters let the client write `user` directly,
   which is a second, forgeable source of truth next to the real one. Sign-in
   and sign-out are `signIn`/`signOut` from `next-auth/react` at the call sites.
3. **Only `/reports` is gated, and that is a product decision, not an
   oversight.** `middleware.ts` matches `/reports/:path*` and nothing else.
   `/`, `/dashboard`, `/chat`, `/resources` and the whole SOS flow stay open,
   because putting a Google round-trip in front of someone asking for help
   during a disaster is a real harm — outages are exactly when this app matters,
   and the person may have no Google account or no route to Google's servers.
   Widening the matcher is the change to think hard about, not make casually.

### The gate is a redirect, not authorization

Nothing is being secured. The reports behind `/reports` are mock data in
`useState`; there is no user-scoped data to protect, and the store still resets
on refresh even while signed in — so signing in implies a persistence this app
cannot yet deliver. The gate becomes a real access control when the deferred
`users` table lands. Until then, do not describe it as securing anything.

### Three properties that are easy to break

- **`middleware.ts` must not import `lib/auth.ts`.** Middleware runs on the edge
  and `authOptions` pulls in the Google provider and Node crypto. Read
  `process.env.NEXTAUTH_SECRET` directly instead.
- **`callbackUrl` is validated by parsing, not by prefix.** A `startsWith('/')`
  check is not enough: the URL parser treats `\` as `/` for special schemes and
  strips tabs and newlines, so `?callbackUrl=/\evil.example` resolves to another
  host. `app/login/page.tsx` resolves the URL and compares `origin`. Do not
  "simplify" it back to a regex.
- **Gating does not make a route dynamic.** `/reports` is still statically
  prerendered, because the check happens in middleware before the route renders.
  The cost is that its HTML has no session, so a signed-in visitor sees the
  "Sign in" button swap to the account menu once the cookie is read. Rendering
  nothing during loading was tried and is worse — the prerendered HTML always
  contains the button, so it blinks on *every* load for signed-out users too.

### Consequences of choosing JWT sessions

`session: { strategy: 'jwt' }`, so there is no database and no users table —
that was deferred along with the admin queue, because the access model belongs
to that work. Two things follow:

- Sign-out clears the cookie (`Max-Age=0`), which ends the session in the
  browser. A token captured beforehand stays valid until it expires. That is
  the trade-off for having no server-side session store; keep `maxAge` short.
- Adding a users table later means an adapter and a schema change, not a
  rewrite of `lib/auth.ts`.

## The AI intake

`ai-backend/` is a standalone FastAPI service. It talks to Gemini, decides what
is still missing, and writes tickets to Postgres. The browser never talks to it
directly.

```
browser ──► /api/ai/chat      (Next route handler) ──► POST /api/chat/message
browser ──► /api/ai/tickets   (Next route handler) ──► POST /api/tickets
                                      │                        │
                                 AI_API_URL              Gemini + Postgres
```

- `app/api/ai/_shared.ts` holds the shared plumbing: `backendUrl()` (reads
  `process.env.AI_API_URL`), the 60s timeout, and the `502 backend_unreachable`
  shape. Both handlers are `force-dynamic` + `runtime: 'nodejs'`.
- `lib/ai-client.ts` is the typed browser client. It talks to the proxy paths
  only, and **resolves rather than rejects** on an expected failure — "the
  assistant is unavailable" is a state the UI renders, not an exception it
  catches.
- `lib/use-ai-chat.ts` is the conversation loop: transcript, ticket draft,
  review/submit lifecycle. It calls the store's `sendMessage` with
  `deferReply: true` and then appends the real answer itself.
- `components/assistant/ticket-review.tsx` is the review + edit form and the
  post-submit receipt. It replaces the composer when the draft is complete.

Three things an agent will get wrong here:

1. **The hook is a required prop, not internal.** `ReliefAssistant` takes `ai:
   AiChatApi`. Each mounting surface calls `useAiChat()` itself —
   `components/layout/app-shell.tsx` for the floating launcher,
   `app/chat/chat-experience.tsx` for `/chat` (which also needs it for the quick
   phrases and the `?intent=` deep link). Two instances would mean two ticket
   drafts, and the review form would show a different one than the conversation
   is building.
2. **`app/api/ai/*` returns 502, not 500, when the backend is down.** The store
   catches and falls back to the scripted offline set. Don't "fix" this into a
   throw.
3. **The wire format is split.** The response *envelope* is snake_case
   (`next_questions`, `is_complete`, `safety_note`), the `draft` object is
   camelCase (`reporterName`, `victimPhone`, `supportNeeded`,
   `onBehalfOfOther`), and `missing`/`next_questions` use camelCase `SlotName`
   values as keys. `lib/ai-client.ts` encodes all of this; don't rename.

### Readiness is never the model's call

`ai-backend/app/slots.py` is the single authority on "is this ticket complete",
and it is duplicated in `lib/ticket-intake.ts` so the form can show what is
missing *while the user types* without a round trip per keystroke. The two must
agree — `missingSlots()` in TS mirrors `missing_slots()` in Python exactly. If
you change one, change both, and extend `ai-backend/app/tests/`.

The rules:

- Always required: reporter name, reporter phone, summary, location, ≥1 support
  type, urgency.
- Required **only** when `on_behalf_of_other`: victim name, victim phone. A
  self-report is complete with no victim fields at all.
- `peopleAffected` is optional and never blocks.
- A phone with fewer than 6 digits counts as missing, not captured. `911` is a
  valid emergency number but not a usable contact number.
- The timestamp is stamped server-side at insert. It is never a model output,
  and the review form shows it as an explanation rather than an editable field.

### Degradation is visible, never silent

If Gemini is unavailable the service still answers: it returns a real question
with `degraded: true` and `confidence: 0.0`, preserving any hand edits so an
outage cannot cost the reporter a correction. The UI marks those bubbles
"Offline reply" with a dashed border and `ChatMessage.offline`. **Never fake a
model answer silently** — during an emergency a canned reply presented as real
is worse than a visible gap.

`useAiChat` deliberately does *not* let the store's scripted reply land first.
`sendMessage(..., { deferReply: true })` appends only the user message, so the
canned answer is a fallback rather than something the real answer follows.

## State: in-memory only, and it resets on refresh

`lib/store.tsx` exports `AppProvider` / `useApp`, mounted in
`components/layout/app-shell.tsx` (alongside `ToastProvider`). It is the single
source of truth: `signIn`/`signOut`, `sendMessage`, `appendAssistantMessage`,
`scriptedReplyFor`, `confirmActionCard`, `dismissActionCard`,
`createReportFromTicket`, `advanceStage`, `triggerSos`, `getReport`.

- All state is plain `useState`. **There is no persistence.** A hard refresh or a
  new tab resets the session user, the chat transcript, and every report created
  in-session. Client-side `<Link>` navigation preserves state; a reload does not.
- Consequence: create a report via SOS, hard-refresh its `/reports/[id]` URL, and
  you get "Report not found" — the store came back empty. This is expected
  behavior, not a bug to chase.
- The AI ticket is the one exception: it is a real Postgres row, so it survives a
  reload even though the in-memory `Report` mirrored from it does not.
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

### Two vocabularies for "what kind of help"

`CategoryId` (8 values) is the **routing** vocabulary used by the dashboard and
reports. `SupportType` (4 values) is the **intake** vocabulary the AI
classifies into: `rescue`, `relief-supplies`, `medical`, `security`. They are
deliberately different resolutions — "food, clothes and a place to sleep" is one
support type that relief splits across two departments.

`SUPPORT_ROUTING` + `routeForSupportTypes()` in `lib/types.ts` map between them,
ranked so the crew that must arrive first leads (`medical → rescue → security →
relief-supplies`). `security` was added along with the `dept-security`
department; both are new, and `CATEGORY_ICONS` in `app/dashboard/page.tsx` is a
separate hand-maintained map that also needed the entry.

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
- The ticket receipt in `components/assistant/ticket-review.tsx` renders
  `new Date(ticket.created_at)`. That is safe only because `created_at` is
  stamped by Postgres, the receipt renders **after** a user action, and the
  review step is unreachable until a reply has arrived. Keep it that way — a
  `new Date()` in a value that renders on first paint is a mismatch.
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
2b. **A grid's column count must divide the item count.** The dashboard's "I need
   help with" grid renders `CATEGORIES`, now 8 entries. It was `lg:grid-cols-7`
   and adding `security` orphaned a tile on its own row. It is now
   `grid-cols-2 sm:grid-cols-4 xl:grid-cols-8` — 2, 4 and 8 all divide 8, so no
   viewport width produces a gap. If you add or remove a category, recheck this
   grid before you recheck anything else.
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

There are two env files, both gitignored, both read server-side only.

**Root `.env`** — read by the proxy handlers and by the auth config:

```
AI_API_URL=http://127.0.0.1:8000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
```

`AI_API_URL` is read via `process.env` in `app/api/ai/_shared.ts`; the OAuth
vars are read in `lib/auth.ts` and `middleware.ts`. None of them is a
`NEXT_PUBLIC_` var and none must become one — the whole point of the proxy is
that the browser never learns the backend's address or key, and the whole point
of the server-side OAuth handler is that it never learns the client secret.

**`ai-backend/.env`** — `GEMINI_API_KEY`, `DATABASE_URL`, `GEMINI_MODELS`,
timeouts, `CORS_ORIGINS`. Read by `pydantic-settings` in `ai-backend/app/config.py`.
`.env.example` in both directories is the committed template.

- **The Gemini key must never be committed, and never sent to a browser.** It is
  in `ai-backend/.env` only. If a connection problem tempts you to move it to a
  `NEXT_PUBLIC_` var, the fix is wrong, not the symptom.
- Two config traps, both hit already:
  - List-valued settings need `Annotated[tuple[str, ...], NoDecode]`
    (`gemini_models`, `cors_origins`). Without it pydantic tries to JSON-parse a
    comma-separated env value and dies with `SettingsError: error parsing value
    for field "gemini_models"`.
  - `AI_API_URL` has no default. Missing it should be a loud startup error, not a
    silent fallback to localhost that fails per-request in production.
- The service **starts even when Postgres is unreachable** and logs
  `postgres unavailable, ticket creation disabled`. Chat still works; `POST
  /api/tickets` returns 503. `/api/ready` reports `database_connected: false`.
  This is intentional — intake must survive a database blip.

## Performance invariants

No images, icon fonts, chart libraries, or map tiles anywhere — avatars are inline
SVG data URIs, the "map" is pure CSS/SVG, sparklines are inline SVG, the Google
mark is inline SVG. `lucide-react` and `framer-motion` are in
`next.config.js → experimental.optimizePackageImports`, so only used icons and
motion primitives bundle. Shared First Load JS is 87.3 kB. Keep it that way; a
real image or chart dependency is a visible regression.
