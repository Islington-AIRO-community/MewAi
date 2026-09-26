# FLARE — Post-Disaster Relief Network

A high-trust, accessibility-first relief platform UI. One tap to reach help: an AI
relief assistant (text **and** hands-free voice), live report tracking with a
department-routing timeline, and a persistent one-tap SOS surface.

> **Status:** front-end demo. All data is realistic mock data held in client
> state — there is no backend, no database, and no real emergency dispatch. Every
> interaction is fully wired so the whole product can be walked end-to-end.

---

## Table of contents

- [Quick start](#quick-start)
- [What it does](#what-it-does)
- [Tech stack](#tech-stack)
- [Routes](#routes)
- [Project structure](#project-structure)
- [Design system](#design-system)
- [Architecture](#architecture)
- [Key flows](#key-flows)
- [Accessibility](#accessibility)
- [Performance](#performance)
- [Scripts](#scripts)
- [Design decisions worth knowing](#design-decisions-worth-knowing)
- [Wiring up a real backend](#wiring-up-a-real-backend)

---

## Quick start

Requires **Node.js 20+** (developed on Node 22) and npm.

```bash
npm install
npm run dev        # http://localhost:3000
```

Production:

```bash
npm run build
npm start
```

Quality gates:

```bash
npm run typecheck  # tsc --noEmit
npm run lint       # next lint  (next/core-web-vitals)
```

Current status — all three pass clean:

| Check | Result |
| --- | --- |
| `npm run build` | 10 routes, compiles without warnings |
| `npm run typecheck` | no errors |
| `npm run lint` | no warnings or errors |

### Try it in 60 seconds

1. Open `/` → **Sign in with Google** (simulated OAuth, no network call).
2. On `/dashboard`, watch the four counters count up and the triage feed populate.
3. Open the floating assistant orb (bottom-right) → switch to **Live voice** →
   send a message like *"we are trapped"* or *"someone cannot breathe"*.
4. A **System Action Card** appears: *Information Captured → Redirecting to
   Urban Search & Rescue*. Press **Confirm & Dispatch Request**.
5. A new report (`RPT-2026-0426`) now exists — follow it from the dashboard into
   its detail page and the five-stage stepper.
6. Press the red **SOS** dock → pick a distress type → one-tap signal creates a
   `CRITICAL` report with an assigned responder and a 4-minute ETA.

---

## What it does

### 1. Navigation, auth and system status

- Live status badge: **Live Relief Mode** with region, active-responder count and
  open-incident count, plus a pulsing indicator.
- **Continue with Google** button (inline SVG mark, no external image requests).
- Profile avatar menu when signed in: overview, my reports, assistant, resources,
  emergency SOS, sign out. Falls back to a **Sign in** CTA when signed out.
- Quick SOS shortcut in the header on every route.
- Mobile bottom tab bar (Home / Reports / Assistant / Help) with a shared height
  token so nothing overlaps the SOS strip above it.

### 2. AI Relief Assistant (floating **and** full-screen)

Available as a floating orb + panel on every route, and as a dedicated
full-screen experience at `/chat`.

- **Text chat / Live voice** switcher.
- Voice mode: 8-bar animated waveform that reflects state
  (`idle → connecting → listening → thinking → speaking`, plus `muted`),
  live status text in an `aria-live` region, mute/unmute, and a hands-free
  wake-phrase toggle.
- Chat drawer with full history, search, filters and time-stamped transcript.
- **System Action Cards** — *"Information Captured: Redirecting request to
  [Department]"* with a **Confirm & Dispatch Request** button, dismiss, and the
  extracted fields with confidence scores.
- Deterministic intent routing: six scripted patterns (trapped, life-threatening
  symptoms, shelter, food/water, missing person, hazard) plus a safe default that
  points people to the SOS button.

### 3. Report tracking dashboard

- Counters: **Total · Under Review · Dispatched · Resolved**, each with a delta,
  a 12-point sparkline and a filter deep-link.
- Category filter tiles (7 categories) for one-tap narrowing.
- Report cards: ID, timestamp, location tag, category, priority badge, affected
  people, assigned department, and a mini progress stepper.
- Live triage feed showing AI routing decisions and confidence.
- Search + sort + priority/status filters, empty state included.

### 4. Report detail (`/reports/[id]`)

- Full five-stage stepper: **Report Submitted → AI Triage & Department Assigned
  → First Responders Dispatched → On-Site Assistance → Resolved**, with per-stage
  timestamps and SLA targets derived from priority.
- Department card with live crew availability and average response time.
- Assigned responder with call sign, unit, ETA and certifications.
- AI-extracted fields with confidence bars.
- Full audit timeline (who/what/when, tagged) — system, reporter, department and
  responder actors.
- Actions: copy report code, share link, print, call emergency contact, and a
  demo **advance stage** control.
- Static location map (no third-party tiles, no network dependency).

### 5. Global SOS & quick access

- Fixed bottom-right dock on desktop; a compact strip on mobile, plus an SOS
  entry point in the footer and the assistant.
- Distress type picker (medical, immediate danger, fire/hazard, need rescue) →
  confirm-and-hold → auto-dispatch confirmation with a real created report.
- Creates a `CRITICAL` report with live GPS, auto-dispatch timeline and ETA.

### Plus

- `/resources` — shelters, supply points, emergency contacts and preparedness
  guides, plus plain-language explainers of triage, the queue and location
  privacy.
- Print stylesheet for field teams, `app/icon.svg` favicon, full metadata and
  OpenGraph tags, `robots: noindex`.

---

## Tech stack

| Concern | Choice | Why |
| --- | --- | --- |
| Framework | **Next.js 14.2.35**, App Router | RSC shell + client islands, per-route code splitting |
| Language | **TypeScript 5.6** (`strict`) | Domain model is fully typed |
| Styling | **Tailwind CSS 3.4** | Token-driven utility CSS, no runtime cost |
| Animation | **Framer Motion 11** | Subtle, interruptible transitions |
| Icons | **Lucide React** | Consistent, accessible icon set |
| Primitives | Hand-rolled `cva` + `tailwind-merge` | shadcn-style API with **zero** CLI/network install |
| State | React Context (`AppProvider`) | One client state tree, no Redux needed |
| Data | Mock fixtures | Zero-latency, deterministic demo |

`lucide-react` and `framer-motion` are listed in
`next.config.js → experimental.optimizePackageImports`, so only the icons and
motion primitives actually used are bundled.

---

## Routes

| Route | Rendering | Size | First Load JS | Purpose |
| --- | --- | --- | --- | --- |
| `/` | static | 4.03 kB | 168 kB | Landing, product story, trust signals |
| `/login` | static | 5.83 kB | 126 kB | Google sign-in (simulated) |
| `/dashboard` | static | 5.06 kB | 169 kB | Counters, category filters, triage feed, active reports |
| `/reports` | static | 4.61 kB | 168 kB | Searchable / filterable report list |
| `/reports/[id]` | dynamic | 11.7 kB | 172 kB | Full report detail, timeline, responder |
| `/chat` | static | 2.15 kB | 172 kB | Full-screen AI assistant (server shell + client island) |
| `/resources` | static | 6.18 kB | 126 kB | Shelters, supplies, contacts, guides |
| `/_not-found` | static | 873 B | 88.1 kB | 404 |
| `app/icon.svg` | static | — | — | Favicon |

**87.3 kB** shared First Load JS across every route (React 18 + Next runtime +
the app shell). No page ships an image, icon font, or chart library.

---

## Project structure

```
flare/
├── app/                          # App Router — routes are thin shells
│   ├── layout.tsx                # metadata, viewport, AppShell
│   ├── globals.css               # tokens, focus rings, a11y/print media queries
│   ├── icon.svg                  # favicon
│   ├── page.tsx                  # landing
│   ├── login/page.tsx
│   ├── dashboard/page.tsx
│   ├── chat/
│   │   ├── page.tsx              # server component shell + <Suspense>
│   │   └── chat-experience.tsx   # client island (useSearchParams boundary)
│   ├── reports/
│   │   ├── page.tsx
│   │   └── [id]/page.tsx
│   └── resources/page.tsx
├── components/
│   ├── ui/                       # design-system primitives
│   │   ├── button.tsx            # cva variants + sizes, asChild support
│   │   ├── badge.tsx  card.tsx  tabs.tsx  modal.tsx  toast.tsx
│   │   ├── primitives.tsx        # StatPill, MetaRow, SectionHeading, …
│   │   └── slot.tsx              # asChild clone-merge
│   ├── layout/
│   │   ├── app-shell.tsx         # providers, skip link, fixed stack, tab bar, footer
│   │   ├── site-header.tsx       # status badge, nav, Google CTA, avatar menu
│   │   └── logo.tsx
│   ├── assistant/
│   │   ├── relief-assistant.tsx  # floating orb + panel, mode switcher
│   │   ├── chat-panel.tsx        # transcript, composer, history, search
│   │   ├── voice-panel.tsx       # voice state machine + copy
│   │   ├── voice-waveform.tsx    # 8 animated bars
│   │   └── action-card.tsx       # "Information Captured" system cards
│   ├── emergency/
│   │   ├── sos-floating-bar.tsx  # desktop dock + mobile strip
│   │   ├── sos-dialog.tsx        # type → confirm → dispatched
│   │   ├── sos-button.tsx
│   │   └── emergency-status-badge.tsx
│   └── reports/
│       ├── report-card.tsx  stat-card.tsx  badges.tsx  progress-stepper.tsx
├── lib/
│   ├── types.ts                  # domain model + all taxonomies
│   ├── mock-data.ts              # 9 reports, stats, triage feed, chat script
│   ├── store.tsx                 # AppProvider — the single client state source
│   ├── time.ts                   # fixed demo clock + greeting
│   ├── utils.ts                  # cn, relativeTime, stamps, report codes
│   └── hooks.ts                  # media query, count-up, focus trap, localStorage
├── tailwind.config.ts            # design tokens
├── next.config.js  postcss.config.js  tsconfig.json  .eslintrc.json
```

~9,760 lines of TypeScript/TSX across 39 files, plus `globals.css` and
`app/icon.svg`.

---

## Design system

### Colour

Six semantic ramps, all 50–900, defined in `tailwind.config.ts`:

| Token | 500 | Role |
| --- | --- | --- |
| `navy` | `#334155` (`900: #0F172A`) | Deep slate/navy primary — brand, headers, `surface`/`ink` neutrals |
| `emergency` | `#E11D48` | High-visibility rose — SOS, `CRITICAL`, live voice |
| `alert` | `#D97706` | Amber — `HIGH` priority, caution, supply |
| `dispatch` | `#3B82F6` | Azure — in-flight stages, focus rings, links |
| `relief` | `#10B981` | Calm teal — `Resolved`, success, available crews |
| `surface` / `ink` | `#F8FAFC` / `#020617` | Muted cool grey canvas, high-contrast text |

Semantics are never decorative: `emergency-500` means *a human's life is at risk
right now*, `relief-500` means *this is done*. Colour is always paired with an
icon and a text label, so it never carries meaning alone.

### Type & spacing

- Inter with a full system fallback stack; `mono` for IDs, codes and telemetry.
- Enlarged `2xs` (11px) and `4xl`/`5xl` radii for large touch targets.
- `.nums` enables tabular figures so counters, IDs and clocks don't jitter.
- Line lengths capped at `max-w-prose` (68ch).
- Extra spacing steps `4.5`, `5.5`, `13` for optical rhythm.

### Elevation, motion & texture

- Shadows: `xs · soft · card · lift · ring · glow-rose · glow-navy · inset-top`.
- Keyframes: `pulse-ring`, `pulse-dot`, `breathe`, `shimmer-x`, `slide-up`,
  `scan-y`, `sos-flash`, with `out-expo` and `calm` easings.
- Emergency treatments: `stripe-alert`, `stripe-critical`, `edge-critical`
  (3px inset rose edge), plus `glass` / `glass-dark` and `surface-grid`.
- Animation is used to *confirm* an action, never to decorate. Everything
  collapses under `prefers-reduced-motion: reduce`.

### CSS variables in `globals.css`

`--surface`, `--surface-raised`, `--ink`, `--muted-ink`, `--ring`, plus
`--tabbar-h` (4.25rem) and `--sos-strip-h` (4.5rem). The two bottom-docked
layers share height tokens so stacked fixed furniture can never drift out of
alignment or overlap.

---

## Architecture

### Server shell, client islands

Routes stay server components. Anything interactive is a `"use client"` island
mounted inside them. `/chat` is the clearest case: `page.tsx` renders metadata, a
`<Suspense>` fallback skeleton and an `<h1 class="sr-only">`, while
`chat-experience.tsx` owns the interactive surface — `useSearchParams` requires a
Suspense boundary during prerendering, and the visible heading is screen-reader
only so the floating panel does not duplicate it.

### One state tree

`lib/store.tsx` exposes `AppProvider` / `useApp`:

| API | Effect |
| --- | --- |
| `signIn` / `signOut` | Session user; drives header CTA vs. avatar menu |
| `sendMessage(text, {viaVoice})` | Appends the user turn, waits a length-scaled delay, replies from the scripted matcher, emits an action card when one matches |
| `confirmActionCard(id)` | Converts a card into a real `Report` (id sequence starts at 426), marks the card confirmed, posts a system message |
| `dismissActionCard(id)` | Marks dismissed, keeps details in the transcript |
| `advanceStage(id)` | Demo control: moves a report one step along the lifecycle and appends a timeline event |
| `triggerSos({label, lat, lng})` | Creates a `CRITICAL` SOS report with a responder and ETA |
| `getReport(id)` | Lookup |

Selectors (`cn`, `reportCodeFromId`, `relativeTime`, `clockTime`, `seeded`) live
in `lib/utils.ts`; the domain model and every taxonomy — categories, priorities
with SLA minutes, stages, departments with crew status — live in `lib/types.ts`.

### Mock data

`lib/mock-data.ts` seeds **9 reports** (`417`–`425`) covering every category and
every lifecycle stage, each with a realistic location, people affected,
vulnerability flags, department, responder, AI-extracted fields with confidence
scores, and a hand-written audit timeline. Plus dashboard stats with sparklines,
a triage feed, a nine-message seeded conversation with two confirmed action
cards, and six scripted intent patterns.

---

## Key flows

### Report a need → track it

```
/chat or floating orb
  → type / speak a need
  → intent match → "Information Captured" action card (routed department + confidence)
  → Confirm & Dispatch Request
  → Report created at stage `triage` with a timeline entry
  → /dashboard counter + card update
  → /reports/[id] stepper, responder, ETA, audit log
  → (demo) advance stage → dispatched → on-site → resolved
```

### SOS

```
SOS dock / strip / footer / header
  → pick distress type (medical · danger · fire · rescue)
  → confirm-and-hold
  → CRITICAL report, live GPS, auto-dispatch timeline, responder + 4 min ETA
  → toast + link into the new report
```

### Sign in

```
/login → Continue with Google → simulated session
  → header swaps CTA for avatar menu
  → /dashboard greeting, personalised reporter name on new reports
```

---

## Accessibility

Built to WCAG 2.2 AA, and verified in a real browser rather than assumed.

- **Skip link** to `#main` — visually hidden until focused, then a 44px target.
- **Visible focus everywhere**: a 2px `dispatch-600` ring with 2px white offset
  on `:focus-visible`, never removed for keyboard users. Report cards use
  `focus-within:` so the whole card lights up when its stretched title link
  takes focus.
- **Semantics**: one `<h1>` per route, no heading-level jumps (report cards take
  a `titleTag` prop so the landing page goes `h1 → p` instead of `h1 → h3`),
  `<nav>`/`<main>`/`<header>`/`<footer>` landmarks, real `<button>`s, `<label
  for>` on the chat composer, `aria-current` on active nav.
- **Keyboard**: full tab order with a focus ring at every stop; roving arrow
  keys + `Home`/`End` on tabs; `Enter` to send, `Shift+Enter` for newline;
  `Escape` closes the assistant, modal and menus; focus is trapped in dialogs.
- **Live regions**: voice state announces via `aria-live` (`assertive` while
  listening), toasts are `role="status"`, counters are labelled.
- **Targets**: interactive elements are ≥44px; footer links get `py-1` padding
  to clear 24px; a few links are visually small only because their hit area is
  the entire card (confirmed by hit-testing).
- **User preferences**: `prefers-reduced-motion` collapses animation duration to
  0.01ms and iteration count to 1 (verified: 2.4s → 1e-05s); `forced-colors`
  switches to system colours with a 3px `Highlight` outline; `@media print`
  drops chrome and keeps the report.
- **Zoom** is never blocked (`maximumScale: 5`), inputs are ≥16px so iOS doesn't
  zoom on focus, and there is **zero horizontal overflow** from 390px to 1920px.

---

## Performance

- **87.3 kB** shared First Load JS; heaviest route is 11.7 kB of route code.
- 8 of the 9 routes are statically prerendered; only `/reports/[id]` is dynamic.
- **No images, icon fonts, chart libraries, or map tiles.** Avatars are inline
  SVG data URIs, the map is pure CSS/SVG, sparklines are inline SVG, and the
  Google mark is inline SVG.
- `optimizePackageImports` for Lucide and Framer Motion.
- Motion is transform/opacity-only; counters use `requestAnimationFrame` and
  skip entirely under reduced motion.
- Mobile-first and text-first for low-bandwidth use.

---

## Scripts

| Script | Action |
| --- | --- |
| `npm run dev` | Dev server on :3000 |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint via `next/core-web-vitals` |
| `npm run typecheck` | `tsc --noEmit` |

---

## Design decisions worth knowing

These are the non-obvious constraints that shaped the code — they will save you
from re-introducing bugs that were already found and fixed.

1. **One fixed demo clock.** `lib/time.ts` exports `DEMO_NOW`
   (`2026-09-26T06:00:00Z`). Every human-facing time string resolves against it,
   never `new Date()`. Static routes are prerendered at build time and hydrated
   much later, so a real clock makes server and client text drift the moment a
   relative-time bucket boundary is crossed — which React reports as a hydration
   mismatch (#425/#418/#423). `relativeTime()` and the dashboard greeting both
   take the anchor as a default. Consequence: anything *new* created in-session
   (a dispatched report, a new chat message) does use the real clock, which is
   correct — it only renders on the client, after hydration.

2. **`asChild` must not rewrite `children`.** `components/ui/slot.tsx` merges
   class names and refs into the cloned child and then… stops. Reassigning the
   clone's `children` to the child element nests anchors inside anchors
   (`<a><a href>…</a></a>`), which is invalid HTML and produced a site-wide
   hydration failure.

3. **Buttons are `whitespace-nowrap` by default — override in grids.** The base
   class makes long labels unshrinkable. Seven `lg:grid-cols-7` category tiles
   then blew out the page by 94px at 1280–1536px. Those tiles pass
   `whitespace-normal min-w-0`.

4. **`Tabs` is split into `TabsProvider` / `TabList` / `Tabs` / `TabPanel`**, so
   a panel can live in a different DOM region from its trigger. `TabPanel`
   renders nothing unless the value is active, which keeps inactive panels out
   of the accessibility tree.

5. **Fixed bottom furniture shares height tokens.** `--tabbar-h` and
   `--sos-strip-h` in `globals.css` replace hardcoded rem offsets; anything
   docked above the tab bar adds those variables instead of a magic number.

6. **The assistant launcher is hidden below `sm`.** Otherwise the orb, the
   assistant panel, the SOS dock and the tab bar all compete for the same corner
   on a 390px phone. Mobile instead gets an **Assistant** tab and an **Ask AI**
   button in the SOS strip.

7. **The assistant panel is height-capped** with
   `sm:max-h-[calc(100dvh-8.75rem)]` (and `-7rem` when expanded), and the
   message list scrolls internally. Without the cap, a long transcript grew the
   panel off-screen (`top: -1686px`).

8. **No `/sos` route.** Header, footer and mobile surfaces all open the
   `SosDialog` through shell state — one dialog, no dead links.

9. **`.no-print` on the assistant and all chrome.** Reports must stay printable
   for field teams.

10. **Watch out for stray dev servers.** A leftover `next dev` re-writes `.next`
    underneath a running `next start` and produces `ChunkLoadError` and 400/404
    chunk errors that masquerade as application bugs. Both modes report as
    `next-server (v14.2.35)`, so `pkill -f "next dev"` will not match. Check
    `ps -eo pid,args | grep next`, kill by PID, then `rm -rf .next && npm run
    build`.

---

## Wiring up a real backend

The demo is deliberately backend-free. To make it real:

| Concern | Where it goes |
| --- | --- |
| Auth | Replace `signIn` in `lib/store.tsx` with a real OAuth/session call; the header already branches on `user` |
| Persistence | Back `REPORTS` with a database; the `Report` type in `lib/types.ts` is the schema |
| Assistant | Swap `SCRIPTED_REPLIES` for a streaming endpoint; `sendMessage` already has the async shape and `isResponding` state |
| Triage/routing | Replace the regex matcher with the triage service; `getDepartment()` and `DEPARTMENTS` model the targets |
| Live updates | Feed `currentStage` / `stageTimestamps` over SSE or a websocket instead of the `advanceStage` demo control |
| Geolocation | Replace the hardcoded coordinates in `SosDialog` with `navigator.geolocation` |
| Emergency dispatch | `triggerSos` is the single seam to connect a real dispatch system |

---

## Accessibility & safety notes

FLARE is a **demonstration interface**. It does not contact emergency services,
it does not share your location, and it is not approved for real incident
response. In a real emergency, contact your local emergency number first — the
assistant's scripted replies say as much.
