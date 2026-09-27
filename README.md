# FLARE — Post-Disaster Relief Network

A high-trust, accessibility-first relief platform. One tap to reach help: an AI
relief assistant (text **and** hands-free voice) that interviews you and files a
real ticket, live report tracking with a department-routing timeline, and a
persistent one-tap SOS surface.

> **Status:** the UI is a demo over mock data, with three real subsystems: the
> AI intake in `ai-backend/` talks to Gemini, collects a relief ticket, and
> writes it to Postgres; sign-in is real Google OAuth; and `/admin` is a real
> response queue that reads those rows and writes their status. Everything else
> is client state. There is no real emergency dispatch.

---

## Table of contents

- [Quick start](#quick-start)
- [The AI intake](#the-ai-intake)
- [The admin queue](#the-admin-queue)
- [Authentication](#authentication)
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
npm test           # vitest — 39 tests, 2 files, no jsdom
```

Current status — all clean:

| Check | Result |
| --- | --- |
| `npm run build` | 23 routes (10 static, 13 dynamic) + edge middleware, compiles without warnings |
| `npm run typecheck` | no errors |
| `npm run lint` | no warnings or errors |
| `npm test` | 39 tests, 2 files, no jsdom, no model calls |
| `ai-backend` pytest | 170 tests, 165 pass, 5 opt-in live tests skipped |

### Try it in 60 seconds

1. Open `/` → **Sign in with Google** (real OAuth — see [Authentication](#authentication)).
2. On `/dashboard`, watch the four counters count up and the triage feed populate.
3. Open the floating assistant orb (bottom-right) → switch to **Live voice** →
   send a message like *"we are trapped"* or *"someone cannot breathe"*.
4. A **System Action Card** appears: *Information Captured → Redirecting to
   Urban Search & Rescue*. Press **Confirm & Dispatch Request**.
5. A new report (`RPT-2026-0426`) now exists — follow it from the dashboard into
   its detail page and the five-stage stepper.
6. Press the red **SOS** dock → pick a distress type → one-tap signal creates a
   `CRITICAL` report with an assigned responder and a 4-minute ETA.

To file a real ticket instead, see [The AI intake](#the-ai-intake). To see the
side an operator sees, set `ADMIN_EMAILS` to your own address and open
`/admin` — see [The admin queue](#the-admin-queue).

---

## The AI intake

`ai-backend/` is a real FastAPI service. It interviews the reporter, refuses to
create a ticket until every required attribute is present, and writes what it
collects to Postgres.

```
browser ──► /api/ai/chat      (Next route handler) ──► POST  /api/chat/message
browser ──► /api/ai/tickets   (Next route handler) ──► POST  /api/tickets
browser ──► /api/ai/tickets/… (Next route handler) ──► GET   /api/tickets/mine, /claim, …
browser ──► /api/ai/admin/…   (Next route handler) ──► GET   /api/tickets, PATCH /{id}/status
                                          │                   │
                                     AI_API_URL          Gemini + Postgres
```

The Next.js proxy routes exist so the Gemini key never reaches a browser, and so
`/api/ai/admin/*` has somewhere to enforce `ADMIN_EMAILS` — the Python service
authenticates nobody. They validate the request, forward it, and pass the status
through: `502 backend_unreachable` when the service is down, which the UI treats
as a state rather than an error.

One path does **not** go through the proxy: `POST /api/ai/live-token` mints a
short-lived, single-use Gemini token and the browser then opens a `wss://` socket
to Gemini directly, so voice audio never touches these servers. See
[Live voice](#live-voice).

### Running it

```bash
cd ai-backend
cp .env.example .env      # add your key from https://aistudio.google.com/apikey
docker compose up -d db   # Postgres
./dev.sh                  # uvicorn on :8000
```

Then point the front end at it — the root `.env` holds one variable:

```
AI_API_URL=http://127.0.0.1:8000
```

**The front end works without it.** With the service down, replies come from the
scripted offline set and are labelled *"Offline reply"* with a dashed border. A
canned answer presented as a real one during an emergency is the one failure
mode worth UI space, so it is never silent.

### What a ticket must contain

| # | Attribute | Required when |
| --- | --- | --- |
| 1 | Reporter name | always |
| 1 | Reporter contact number | always, and it must be dialable |
| 2 | Victim name | a relative is filing for someone else |
| 2 | Victim contact number | a relative is filing for someone else |
| 3 | Summary of what the reporter described | always |
| 4 | Creation timestamp | stamped by Postgres at insert, never by the model |
| 5 | Location of the victim | always |
| 6 | Support classification | always, ≥1 of the four classes |

The four support classes are `rescue`, `relief-supplies` (food, water, clothing,
shelter), `medical`, and `security`. A ticket can carry several at once.

`peopleAffected` is asked about but never blocks submission. A phone with fewer
than six digits counts as *missing* rather than captured — `911` is a valid
emergency number but not a usable contact number.

### The flow

1. The reporter describes what is happening in their own words.
2. The assistant asks for whatever is still missing — at most two questions per
   turn, so it never becomes a form.
3. When nothing is missing, the composer is replaced by a **review step**: every
   field is editable, and a hand edit is remembered, so a correction cannot be
   reverted by the assistant's next answer.
4. **Submit** writes the ticket, mirrors it into the report list, and shows a
   receipt with a ticket code (`TKT-000002`) telling the reporter an admin will
   handle it. The report starts at the `submitted` stage — nothing moves until a
   human reviews it.

### Readiness is never the model's call

Whether a ticket is complete is computed in `ai-backend/app/slots.py` on every
turn, and re-checked in `POST /api/tickets` before the row is written. Gemini is
constrained to a JSON schema and asked to extract, never to decide.

The rule is duplicated in `lib/ticket-intake.ts` so the review form can show what
is missing *while the user types*, without a round trip per keystroke. The
backend is authoritative; the two must agree.

```bash
cd ai-backend && .venv/bin/python -m pytest app/tests -q   # 170 tests, no model calls
```

More detail in [`ai-backend/README.md`](ai-backend/README.md).

---

## The admin queue

A filed ticket is the only thing in this app that outlives a page refresh. So
there is a screen for the people who answer them: `/admin`, the response queue.

```
browser ──► /api/ai/admin/tickets   ──► GET  /api/tickets     (the queue)
browser ──► /api/ai/admin/tickets/… ──► PATCH /api/tickets/{id}/status
browser ──► /api/ai/admin/stats     ──► GET  /api/tickets/stats
```

**Access control is an `ADMIN_EMAILS` allowlist** — a comma-separated list in the
root `.env`, enforced in `app/api/ai/_session.ts` on the response path and again
in `middleware.ts` for the redirect. It is the whole permission model: no role
table, no users table. Unset admits nobody, so a deployment that forgets it is
locked rather than open.

`ai-backend`'s own `GET /api/tickets` and `PATCH /{id}/status` enforce nothing —
`requireAdmin()` running inside the Next proxy *is* the access control. That is
why the Python service must stay on a private network.

### What the queue does

- Every filed ticket with the reporter's name and number, location, the support
  classes it needs, its priority, and how many people are affected.
- **Filters by status** and, multi-select, **by kind of help** — rescue, supplies,
  medical, security. Selecting several is a union: a ticket needing medical *and*
  rescue shows up under either. Both filters run as SQL, not in the page, because
  the proxy caps a page at 100 rows and narrowing a list the browser already
  holds can only hide matches. The header says "100 of 143" rather than implying
  it showed everything.
- **"Move to" buttons** that write the ticket's status. This is the only writer
  anywhere in the system, which is the point: the status a reporter reads on their
  portal comes from the row, so a responder — never the model — decides whether a
  ticket is under review, dispatched, resolved or closed.
- Counts by status, urgency and support class. The support counts deliberately
  sum to more than the total, because one ticket can need several kinds of help,
  and the panel says so in words rather than leaving it to look like a bug.

The reporter's side of the same data is `/tickets` and `/tickets/[id]`: their own
queue and a follow-up conversation on one ticket.

---

## Authentication

Sign-in is real Google OAuth via **next-auth 4.24** (v4, not Auth.js v5 — v5
targets Next 15). The browser never sees the client secret; the handshake runs
entirely in `/api/auth/[...nextauth]`.

### Setting it up

Sign-in fails at Google's consent screen until the client exists. Create one at
[Google Cloud → Credentials](https://console.cloud.google.com/apis/credentials)
as a **Web application**, then:

```bash
cp .env.example .env      # then fill in the four variables below
```

| Variable | Where it comes from |
| --- | --- |
| `GOOGLE_CLIENT_ID` | the OAuth client's ID |
| `GOOGLE_CLIENT_SECRET` | the OAuth client's secret |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | this app's origin, e.g. `http://localhost:3000` |
| `AI_API_URL` | the AI service, e.g. `http://127.0.0.1:8000` |
| `ADMIN_EMAILS` | comma-separated addresses allowed into `/admin`. Unset admits nobody |

Register the redirect URI with Google **exactly** as NextAuth expects, or Google
rejects the callback:

```
http://localhost:3000/api/auth/callback/google
https://your-domain/api/auth/callback/google
```

All four are read server-side. None is a `NEXT_PUBLIC_` variable and none should
become one.

### What is gated, and what deliberately is not

`middleware.ts` gates three subtrees: **`/reports`, `/tickets` and `/admin`**.
Everything else — the landing page, `/dashboard`, `/chat`, `/resources`, and the
whole SOS flow — works signed out.

Leaving intake open is a deliberate product decision, not an oversight. Putting a
Google round-trip in front of someone asking for help during a disaster does real
harm: outages are exactly when this app matters, the person may have no Google
account, and Google's consent screen is another host that can be unreachable. The
login page's promise that you can send an SOS without signing in is enforced by
the matcher, not just asserted in copy.

The three gated subtrees are gated for two different reasons. `/reports` and
`/tickets` exist *because* of an account. `/admin` exists because of the
`ADMIN_EMAILS` allowlist.

### The gate is a redirect, not authorization

Worth being blunt about: **the matcher itself is securing nothing.** A matcher can
be routed around, so every check that matters is repeated on the response path —
`requireAdmin()` for `/admin`'s API, and the httpOnly session cookie for the
owner-scoped ticket reads. The redirect is UX.

Per route:

- `/admin` — real. Every row holds a reporter's name, phone number and address.
- `/tickets`, `/tickets/[id]` — real, for the same reason. A wrong owner and a
  missing ticket are both `404`, never `403`, so ids cannot be enumerated.
- `/reports` — not yet. Still mock fixtures in React state, resetting on refresh,
  with no user-scoped data to protect. The gate implies a persistence this app
  cannot yet deliver; it becomes real access control when a users table lands.

### How it is wired

- `lib/auth.ts` holds `authOptions` and is **server-only**.
- `lib/session-user.ts` projects a session onto the app's `SessionUser`. The
  store's `user` is *derived* from the session rather than written by the
  client, so there is no forgeable second source of truth.
- `SessionProvider` wraps `AppProvider`. That order is load-bearing: `useSession`
  throws without a provider, and `AppProvider` calls it.
- Google's avatar URL is deliberately discarded. This app renders no images
  anywhere, so following `picture` would add an external request per page load
  for a cosmetic gain; `Avatar` falls back to initials.
- Sessions are JWTs, so there is no database. Sign-out clears the cookie; a token
  captured beforehand stays valid until it expires.

See `AGENTS.md` for the traps — the middleware edge-runtime constraint, the
`callbackUrl` open-redirect guard, and why a statically prerendered gated route
still has session-free HTML.

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
- **Live AI intake** when the backend is running: it extracts a relief ticket
  from the conversation, shows a live checklist of what is still missing, and
  replaces the composer with an editable review form once it has everything.
  Submitting writes a real ticket and returns a receipt. See
  [The AI intake](#the-ai-intake).
- **System Action Cards** — *"Information Captured: Redirecting request to
  [Department]"* with a **Confirm & Dispatch Request** button, dismiss, and the
  extracted fields with confidence scores.
- Deterministic intent routing in the scripted fallback: six patterns (trapped,
  life-threatening symptoms, shelter, food/water, missing person, hazard) plus a
  safe default that points people to the SOS button.

### 3. Report tracking dashboard

- Counters: **Total · Under Review · Dispatched · Resolved**, each with a delta,
  a 12-point sparkline and a filter deep-link.
- Category filter tiles (8 categories, including **Security**) for one-tap
  narrowing.
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

### 5. Reporter ticket portal (`/tickets`, `/tickets/[id]`)

- `/tickets` — the signed-in reporter's own filed tickets, each with its live
  status. Ownership is decided by the httpOnly session cookie server-side, never
  by anything the browser sends.
- `/tickets/[id]` — one ticket's status plus a follow-up conversation with the
  assistant. The assistant is handed the status and asked what it *means*; it is
  never asked what the status *is*.
- A ticket filed while signed out belongs to nobody — anonymous intake is
  supported, so `/tickets` offers a **claim** flow: the reference plus the phone
  number given at filing time.

### 6. Admin response queue (`/admin`)

See [The admin queue](#the-admin-queue). Status and support-type filters over
every filed ticket, and the only control in the system that writes a ticket's
status.

### 7. Global SOS & quick access

- Fixed bottom-right dock on desktop; a compact strip on mobile, plus an SOS
  entry point in the footer and the assistant.
- Distress type picker (medical, immediate danger, fire/hazard, need rescue) →
  confirm-and-hold → auto-dispatch confirmation with a real created report.
- Creates a `CRITICAL` report with live GPS, auto-dispatch timeline and ETA.

### Live voice

Not a mode of the chat panel — a separate path, and the only one that does not go
through the Next proxy.

```
browser ──► POST /api/ai/live-token  (rate-limited per IP)
         ◄── short-lived, single-use Gemini token
browser ══► wss://…  Gemini Live  — audio both ways, never through our servers
```

`lib/live-voice/session.ts` is a state machine over that socket. Its rules were
reverse-engineered by watching a real connection and are pinned in
`lib/live-voice/session.test.ts`, because each one fails *silently*:

- `inputTranscription` is **cumulative**, `outputTranscription` is
  **incremental**. Reading either as the other produces a plausible-looking
  transcript that is subtly wrong.
- A turn ends on `voiceActivity.endOfSpeech`, not `turnComplete`, which the
  service does not reliably send.
- Input audio goes out as `realtimeInput.audio`. On the pinned API version,
  `realtimeInput.mediaChunks` is **accepted and silently discarded** — the model
  hears pure silence, the waveform animates, the status says "Listening", and
  nothing errors on either end.

The microphone is captured by `public/pcm-capture.worklet.js`, which has its own
test for the same reason: it once posted not one sample, and every signal the UI
could see was healthy.

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
| Auth | **next-auth 4.24** + Google OAuth | Real sign-in, httpOnly JWT cookie, no client-side user state |
| State | React Context (`AppProvider`) | One client state tree, no Redux needed |
| Data | Mock fixtures + a real AI intake | Zero-latency demo, with one live subsystem |
| AI service | **FastAPI** + **Gemini** (`ai-backend/`) | JSON-schema-constrained extraction |
| Database | **Postgres 16** | Durable tickets, `asyncpg` pool |

`lucide-react` and `framer-motion` are listed in
`next.config.js → experimental.optimizePackageImports`, so only the icons and
motion primitives actually used are bundled.

---

## Routes

| Route | Rendering | Size | First Load JS | Purpose |
| --- | --- | --- | --- | --- |
| `/` | static | 4.07 kB | 179 kB | Landing, product story, trust signals |
| `/login` | static | 5.07 kB | 137 kB | Google sign-in (real OAuth) |
| `/dashboard` | static | 5.09 kB | 180 kB | Counters, category filters, triage feed, active reports |
| `/reports` | static | 4.62 kB | 180 kB | Searchable / filterable report list — mock data |
| `/reports/[id]` | dynamic | 11.5 kB | 184 kB | Full report detail, timeline, responder |
| `/chat` | static | 2.16 kB | 195 kB | Full-screen AI assistant (server shell + client island) |
| `/tickets` | static | 5.73 kB | 116 kB | The reporter's own filed tickets |
| `/tickets/[id]` | dynamic | 5.7 kB | 116 kB | One ticket: status + follow-up conversation |
| `/admin` | static | 5.93 kB | 108 kB | Response queue — status + support-type filters |
| `/resources` | static | 6.19 kB | 138 kB | Shelters, supplies, contacts, guides |
| `/_not-found` | static | 873 B | 88.2 kB | 404 |
| `app/icon.svg` | static | 0 B | — | Favicon |

11 page routes, of which 9 are statically prerendered. Only `/reports/[id]` and
`/tickets/[id]` are dynamic: both read route params, and neither can export
`generateStaticParams` because it is a client component.

Route handlers — server-side only, so they add nothing to any bundle:

| Route | Purpose |
| --- | --- |
| `/api/auth/[...nextauth]` | OAuth handshake → Google (`nodejs` runtime) |
| `/api/ai/chat` | Proxy → `POST /api/chat/message` |
| `/api/ai/tickets` | Proxy → `POST /api/tickets`, `GET /mine`, `POST /claim` |
| `/api/ai/tickets/[id]`, `[id]/messages` | Proxy → owner-scoped ticket read and follow-up |
| `/api/ai/admin/tickets` | Proxy → `GET /api/tickets` (allowlisted `status`, `support`, `limit`) |
| `/api/ai/admin/tickets/[id]` | Proxy → `PATCH /api/tickets/{id}/status` |
| `/api/ai/admin/stats` | Proxy → `GET /api/tickets/stats` |
| `/api/ai/live-token` | Mints a single-use Gemini Live token; the browser then connects to Gemini directly |

**87.3 kB** shared First Load JS across every route (React 18 + Next runtime +
the app shell) — unchanged by adding auth or the admin queue, because
`next-auth/react` is only pulled into the routes that use it. No page ships an
image, icon font, or chart library. The edge middleware is a separate 48.6 kB
bundle that never reaches the client.

---

## Project structure

```
flare/
├── middleware.ts                 # edge redirect: /reports, /tickets, /admin
├── app/                          # App Router
│   ├── layout.tsx                # metadata, viewport, AppShell (server component)
│   ├── globals.css               # tokens, focus rings, a11y/print media queries
│   ├── icon.svg                  # favicon
│   ├── page.tsx                  # landing          ┐
│   ├── login/page.tsx                              │
│   ├── dashboard/page.tsx                          │ almost every page is
│   ├── reports/                                   │ "use client" — only
│   │   ├── page.tsx                               │ layout.tsx and chat/
│   │   └── [id]/page.tsx                          │ page.tsx are server
│   ├── tickets/                                   │ components
│   │   ├── page.tsx                               │
│   │   └── [id]/page.tsx                          │
│   ├── admin/page.tsx             # the response queue
│   ├── resources/page.tsx
│   ├── chat/
│   │   ├── page.tsx              # server component shell + <Suspense>
│   │   └── chat-experience.tsx   # client island (useSearchParams boundary)
│   └── api/
│       ├── auth/[...nextauth]/    # OAuth handshake (nodejs runtime)
│       └── ai/                    # server-only proxy to ai-backend
│           ├── _shared.ts         # backendUrl(), timeout, 502/400 shapes
│           ├── _session.ts        # requireAdmin(), the ADMIN_EMAILS allowlist
│           ├── chat/route.ts      # POST → /api/chat/message
│           ├── live-token/route.ts# mints a single-use Gemini Live token
│           ├── tickets/           # POST, GET /mine, POST /claim, follow-up
│           └── admin/             # GET queue, PATCH status, GET stats
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
│   │   ├── ticket-review.tsx     # review + edit form, receipt, intake checklist
│   │   ├── ticket-status.tsx     # status badge + its plain-language meaning
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
│   ├── use-ai-chat.ts            # live intake: transcript, draft, review, submit
│   ├── ai-client.ts              # typed client for /api/ai/*
│   ├── ticket-portal.ts          # typed client for /tickets and /admin
│   ├── ticket-intake.ts          # client mirror of ai-backend/app/slots.py
│   ├── live-voice/               # Gemini Live session, audio, worklet, and their tests
│   ├── ai-chat-context.tsx       # one AiChatApi for every mount surface
│   ├── sos-ticket.ts             # filing a ticket from the SOS flow
│   ├── auth.ts                   # next-auth options — SERVER ONLY
│   ├── session-user.ts           # session → SessionUser projection (pure)
│   ├── time.ts                   # fixed demo clock + greeting
│   ├── utils.ts                  # cn, relativeTime, stamps, report codes
│   └── hooks.ts                  # media query, count-up, focus trap, localStorage
├── public/
│   └── pcm-capture.worklet.js    # microphone capture, loaded into an AudioWorklet
├── ai-backend/                   # the AI intake service — see its own README
│   ├── app/
│   │   ├── slots.py              # the required-attribute rule (authoritative)
│   │   ├── prompts.py            # interview spec + JSON response schema
│   │   ├── gemini.py             # client, model fallback loop, JSON decoding
│   │   ├── chat_service.py       # one turn: call, parse, apply edits, readiness
│   │   ├── follow_up_service.py  # per-ticket conversation on a filed ticket
│   │   ├── db.py  schemas.py  config.py  main.py
│   │   ├── routers/              # health, chat, tickets, live
│   │   └── tests/                # 170 tests, no model calls
│   ├── docker-compose.yml        # Postgres (and optionally the API)
│   ├── Dockerfile  dev.sh  requirements.txt
│   └── README.md
├── tailwind.config.ts            # design tokens
├── next.config.js  postcss.config.js  tsconfig.json  .eslintrc.json
└── AGENTS.md                     # the accurate architecture reference
```

~17,100 lines of TypeScript/TSX across 68 files (excluding the two test files),
~6,100 lines of Python across 29 files, plus `globals.css`, the worklet and
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

This holds for exactly one route. `/chat` is the case that works as documented:
`page.tsx` renders metadata, a `<Suspense>` fallback skeleton and an
`<h1 class="sr-only">`, while `chat-experience.tsx` owns the interactive surface
— `useSearchParams` requires a Suspense boundary during prerendering, and the
visible heading is screen-reader only so the floating panel does not duplicate it.

In practice every other page is a `"use client"` component too, so per-route
`metadata` is not available on them. `AGENTS.md` is the accurate reference for
component architecture; this README describes the intent.

The other server-side surface is the `/api/ai/*` proxy tree, which keeps the
Gemini key off the client and gives `/api/ai/admin/*` somewhere to enforce
`ADMIN_EMAILS`.

### The ticket is the durable thing

Everything in `lib/store.tsx` dies on refresh. A ticket row in Postgres does not,
which makes the ticket — not the report, not the chat transcript — the thing this
app actually keeps. Three pages hang off it:

```
/tickets      the reporter's own list, gated on a Google session
/tickets/[id] one ticket: its status, and a follow-up conversation
/admin        the response queue, gated on ADMIN_EMAILS
```

`lib/ticket-portal.ts` is the typed client for all three. It **resolves rather
than rejects** on every failure, the same contract as `lib/ai-client.ts` — "you
are not signed in" and "the service is down" are states the UI renders, not
exceptions it catches. The error vocabulary is the whole set: `not_signed_in`,
`forbidden`, `not_found`, `unreachable`, `unavailable`, `unknown`.

**Status is the database's, and only an operator's.** The reporter's assistant is
handed a ticket's status and asked what it *means*; it is never asked what the
status *is*. The only writer is `PATCH /api/tickets/{id}/status`, reached from
`/admin`. So a follow-up reply can never say "a crew is on the way" while the row
still says `submitted` — the single worst output this backend could produce. A
test pins that with a model that is explicitly instructed to lie about it.

**Who may read a ticket is decided by the httpOnly session cookie**, and a
signed-in reporter's address is re-derived server-side rather than read from the
request. Ownership is never taken from a body field: an earlier version let a
caller file a ticket as a victim and then read their whole queue. Wrong owner and
missing ticket are both `404`, never `403`, so the sequential id space cannot be
enumerated.

### One state tree

`lib/store.tsx` exposes `AppProvider` / `useApp`:

| API | Effect |
| --- | --- |
| `user` | Derived from the OAuth session by `sessionToUser()`; drives header CTA vs. avatar menu |
| `sendMessage(text, {viaVoice, deferReply})` | Appends the user turn, then replies from the scripted matcher. `deferReply` stops after the user turn so the live intake can supply the answer itself |
| `appendAssistantMessage(msg)` | Adds an assistant turn and settles the typing indicator — how a model answer *and* an offline fallback get into the shared transcript |
| `scriptedReplyFor(text)` | The scripted reply for a message, without sending it |
| `confirmActionCard(id)` | Converts a card into a real `Report` (id sequence starts at 426), marks the card confirmed, posts a system message |
| `dismissActionCard(id)` | Marks dismissed, keeps details in the transcript |
| `createReportFromTicket(ticket)` | Mirrors a written AI ticket into the report list at stage `submitted` |
| `advanceStage(id)` | Demo control: moves a report one step along the lifecycle and appends a timeline event |
| `triggerSos({label, lat, lng})` | Creates a `CRITICAL` SOS report with a responder and ETA |
| `getReport(id)` | Lookup |

All of it is plain `useState` with **no persistence** — a hard refresh resets the
session, the transcript, and every in-session report. Tickets are the exception:
they are real rows in Postgres, so they survive a reload even though the mirrored
`Report` does not.

Selectors (`cn`, `reportCodeFromId`, `relativeTime`, `clockTime`, `seeded`) live
in `lib/utils.ts`; the domain model and every taxonomy — categories, priorities
with SLA minutes, stages, departments with crew status — live in `lib/types.ts`.

### Two vocabularies for "what kind of help"

`CategoryId` (8 values) is the **routing** vocabulary the dashboard and reports
use. `SupportType` (4 values: `rescue`, `relief-supplies`, `medical`, `security`)
is the **intake** vocabulary the AI classifies into. They are deliberately
different resolutions — food, clothing and a place to sleep is one support type
that relief splits across two departments.

`SUPPORT_ROUTING` and `routeForSupportTypes()` in `lib/types.ts` map between
them, ranked so the crew that must arrive first leads.

### Mock data

`lib/mock-data.ts` seeds **9 reports** (`417`–`425`) covering every category and
every lifecycle stage, each with a realistic location, people affected,
vulnerability flags, department, responder, AI-extracted fields with confidence
scores, and a hand-written audit timeline. Plus dashboard stats with sparklines,
a triage feed, a nine-message seeded conversation with two confirmed action
cards, and six scripted intent patterns.

---

## Key flows

### File a ticket with the AI assistant

```
/chat or floating orb
  → describe the situation in your own words
  → assistant extracts fields, asks for whatever is still missing (≤2 per turn)
  → live checklist shows each required attribute
  → composer is replaced by the review form once nothing is missing
  → edit anything by hand — a correction survives the next turn
  → Submit → POST /api/tickets → row in Postgres, TKT-000002
  → mirrored into the report list at stage `submitted` (client state, dies on refresh)
  → receipt: an admin will review and contact you on the number you gave

  later, at /tickets/[id]
  → "has anyone come?" → assistant replies, and may only describe the row's status
  → status itself is changed by a responder in /admin, never here
```

### Answer a ticket as an operator

```
/admin  (ADMIN_EMAILS allowlist)
  → the whole queue, newest first, with reporter, location, support classes
  → filter by status, and by kind of help (multi-select: medical + rescue = either)
  → filters run in SQL; the header says "100 of 143" when the page is capped
  → Move to under_review → dispatched → resolved → closed
  → PATCH /api/tickets/{id}/status → the row
  → the reporter's /tickets and any follow-up reply now see the new status
```

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
/login → Continue with Google → real OAuth round trip → /dashboard
  → header swaps CTA for avatar menu
  → /dashboard greeting, personalised reporter name on new reports
```

---

## Accessibility

Built to WCAG 2.2 AA by convention. There is no accessibility test, so these are
invariants a change can break silently rather than things a suite will catch.

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
  listening), toasts are `role="status"`, the admin queue's result count is
  `role="status"` so a filter change is announced, counters are labelled.
- **Colour never carries meaning alone** — every status and support class pairs
  its token with an icon and a text label. This is why the admin support filter
  colours a chip with its own class token *and* keeps the icon and label.
- **Targets**: the intent is ≥44px for interactive elements and ≥16px for inputs
  (so iOS does not zoom on focus). Some filter chips fall short — the `/admin`
  status chips are ~26px tall — so treat that number as a target rather than a
  verified property. Zoom is never blocked (`maximumScale: 5`).
- **User preferences**: `prefers-reduced-motion` collapses animation duration to
  0.01ms and iteration count to 1 (verified: 2.4s → 1e-05s); `forced-colors`
  switches to system colours with a 3px `Highlight` outline; `@media print`
  drops chrome and keeps the report.

---

## Performance

- **87.3 kB** shared First Load JS; heaviest route is 11.5 kB of route code.
- 9 of the 11 page routes are statically prerendered; only `/reports/[id]` and
  `/tickets/[id]` are dynamic. The `/api/ai/*` handlers are server-side and add
  nothing to the bundle.
- **No images, icon fonts, chart libraries, or map tiles.** Avatars are inline
  SVG data URIs, the map is pure CSS/SVG, sparklines are inline SVG, and the
  Google mark is inline SVG. The AI backend is a separate process, so adding
  Gemini and Postgres cost the front end nothing.
- `optimizePackageImports` for Lucide and Framer Motion.
- Motion is transform/opacity-only; counters use `requestAnimationFrame` and
  skip entirely under reduced motion.
- Mobile-first and text-first for low-bandwidth use.

---

## Scripts

| Script | Action |
| --- | --- |
| `npm run dev` | Dev server on :3000 |
| `npm run build` | Production build (runs lint + typecheck) |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint via `next/core-web-vitals` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest, 39 tests across 2 files (the Live protocol rules and the capture worklet) |
| `npm run test:watch` | The same, in watch mode |

In `ai-backend/`:

| Command | Action |
| --- | --- |
| `./dev.sh` | venv + deps + `uvicorn --reload` on :8000 (`PORT=…` to move it) |
| `docker compose up -d db` | Postgres 16 on :5432 |
| `.venv/bin/python -m pytest app/tests -q` | 170 tests, no model calls, no quota |
| `FLARE_LIVE_E2E=1 .venv/bin/python -m pytest app/tests/test_live_e2e.py -q` | 5 opt-in tests against the real Gemini Live service. Spends quota |

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

11. **A new filter needs the proxy allowlist.** `app/api/ai/admin/tickets/route.ts`
    forwards an explicit set of query parameters and drops everything else, on
    purpose, so a caller cannot reach a different upstream route. A filter missing
    from that list does not error — the control renders, the request returns 200,
    and the list comes back unfiltered, which reads as a backend bug.

12. **The `draft` on the wire is snake_case, and the envelope is too.**
    `reporter_name`, `victim_phone`, `support_needed`, `on_behalf_of_other` —
    only `missing` / `next_questions` use camelCase `SlotName` values as *keys*.
    `lib/ai-client.ts` translates it to camelCase TypeScript. A draft read with
    the wrong casing does not throw; it renders an empty review form and offers a
    complete-looking ticket with no summary.

13. **Readiness is computed, never asked for.** `missing_slots()` in
    `ai-backend/app/slots.py` is the single authority, duplicated in
    `lib/ticket-intake.ts` so the form can update as the reporter types. Change
    one, change both.

14. **`SessionProvider` must wrap `AppProvider`.** `useSession` throws without a
    provider rather than degrading, and `AppProvider` calls it — so the reverse
    nesting takes down every route at once.

15. **`middleware.ts` must not import `lib/auth.ts`.** Middleware runs on the edge
    and `authOptions` pulls in the Google provider and Node crypto. Read
    `process.env.NEXTAUTH_SECRET` directly instead.

---

## Wiring up a real backend

The AI intake is already real — see [The AI intake](#the-ai-intake). Everything
else is client state. To make the rest real:

| Concern | Where it goes |
| --- | --- |
| Auth | Done — real Google OAuth, session-only. Next step is a users table so a reporter's tickets can be attributed across devices |
| Persistence | Back `REPORTS` with a database; the `Report` type in `lib/types.ts` is the schema. **Tickets already persist** in Postgres and are the thing this app actually keeps |
| Assistant | The live intake already runs ahead of the scripted replies. To make scripted replies the *only* fallback, delete `SCRIPTED_REPLIES` and let `scriptedReplyFor` throw |
| Admin queue | Done — `/admin` reads every filed ticket, filters by status and support type, and writes status. Still to come: assignment, bulk actions, and a role table behind `ADMIN_EMAILS` |
| Triage/routing | `routeForSupportTypes()` and `DEPARTMENTS` already model the targets; the demo `getDepartment()` matcher is the part to replace |
| Live updates | Feed ticket status (and `currentStage`) over SSE or a websocket instead of re-fetching on filter change |
| Rate limiting | The ticket **claim** flow proves ownership with a 10-digit phone against a guessable sequential reference. Practical online guessing is the only thing stopping a determined caller — revisit before this faces the public internet |
| Geolocation | Replace the hardcoded coordinates in `SosDialog` with `navigator.geolocation` |
| Emergency dispatch | `triggerSos` is the single seam to connect a real dispatch system |

---

## Accessibility & safety notes

FLARE is **not approved for real incident response**. The report-tracking and SOS
surfaces are demonstration interfaces: they do not contact emergency services
and do not share your location. What is real is the AI intake (it talks to
Gemini and writes tickets to a local database), Google sign-in, and the
`/admin` queue that reads and updates those tickets — useful for evaluating the
flow, not a substitute for a dispatch system.

The tickets themselves are real people describing a real emergency, so treat the
demo database accordingly.

In a real emergency, contact your local emergency number first. The assistant
says so too, on every turn that suggests an immediate-danger instruction.
