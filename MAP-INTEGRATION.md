# Map integration plan

Status: **planning complete, not started.** Written 2026-09-26 on branch `map`.

A new session can pick this up cold. Read `AGENTS.md` first — it is authoritative
on architecture and invariants, and several of the constraints below come from it.

## Goal

Visualise where emergency reports are coming from, inside the existing FLARE UI.
Nepal only.

## Decided

- **No globe.** Cesium is out. Scope is Nepal only, so a globe buys nothing.
- **Nepal only, not region-agnostic.** No bbox-as-prop indirection.
- **Mock data first.** Build the map against `lib/mock-data.ts` now; wire the real
  backend when the other team members land their part.
- **Move mock data to Nepal before building the map.** The current 8 mock reports
  are Manhattan (`40.72, -73.98`, fictional districts Eastvale/Northbank/Ridgeway/
  Hillcrest/Old Mill). Building geometry against those and re-targeting later
  throws the work away. Do this first.

## The blocking finding

**There are no coordinates anywhere in the real intake pipeline.**

- `relief_tickets.location` is `text NOT NULL`, free text, max 400 chars
  (`ai-backend/app/db.py:48`)
- `TicketDraft.location: string` (`lib/ai-client.ts:21`)
- The AI intake prompt asks for *"Street, building, floor, and anything that
  stands out"* — a description, not a position
- The only `lat`/`lng` in the repo is `lib/mock-data.ts`, and it is fiction that
  predates the backend

So the map has nothing real to plot. This is backend work, not frontend work, and
it is deferred by the mock-first decision. The risk to hold: the map's *mechanics*
can be validated against mocks, its *usefulness* cannot.

## Invariants this must not break

From `AGENTS.md` — treat any violation as a regression:

- **Shared First Load JS is 87.3 kB. Keep it that way.** No chart libraries, no
  image/icon-font dependencies. A map library is ~230 kB gzip and would roughly
  triple it.
- **No arbitrary hex values.** Use the six Tailwind ramps: `navy`, `emergency`,
  `alert`, `dispatch`, `relief` (+ `surface`/`ink`).
- **`content` globs are `./app ./components ./lib` only.** A new top-level source
  directory is silently purged by Tailwind. Map code goes in `components/map/`.
- **Never call `new Date()`/`Date.now()` to render time on a prerendered route.**
  Thread `DEMO_NOW` from `lib/time.ts` instead. This has already broken 3 routes.
- **No JS test runner exists.** `npm run build` is the gate (it runs lint +
  typecheck). Do not add an `npm test` invocation.
- Report ids: mock data is `417`–`425`, `nextReportSeq` starts at **426**. Bump the
  seed if you add mock reports.
- A grid's column count must divide its item count (see `AGENTS.md` §2b).
- Backend schema is created on startup with idempotent DDL; there is **no
  migration tool** (`ai-backend/app/db.py:6`). Schema changes are hand-edited DDL.

## The open decision — needs the user

**Does the "87.3 kB / no map tiles" invariant still hold now that a map is a
priority?** This is blocking; the answer determines what gets built.

- **Pure SVG, no tiles** — respects the invariant and stays offline-first, but
  with no basemap a pin in a valley is hard to act on.
- **Lazy-loaded raster tiles** — `next/dynamic` so tiles only fetch when the map
  view opens and stay off the SOS critical path. Defensible, and it keeps
  "offline SOS works" true, but it breaks a written invariant so it needs
  sign-off. **Recommended**, with `AGENTS.md` and the README updated to match.

## The plan

### Step 1 — location provenance in the type (unblocked, do first)

Add the future fields as **optional now**, so wiring real geocoding later fills
in fields that already exist instead of being a breaking change:

```ts
location: {
  label: string;
  area: string;
  lat: number;
  lng: number;
  landmark: string;
  source?: 'gps' | 'geocoded' | 'inferred';  // how we got the point
  confidence?: number;                       // 0-1, from the agent
  radiusKm?: number;                         // real uncertainty, when known
};
```

Why this matters more than it looks: **the agent knows whether a location came
from a GPS fix or from parsing "near the bridge", and the data model currently
throws that away.** A geocoded guess and a GPS fix are indistinguishable in
`Report.location` today. `source` + `confidence` are what let the map draw a pin
or a halo correctly.

Also mirror this in `ai-backend/app/schemas.py` and the DDL in `app/db.py` so the
two sides agree (same discipline as `lib/ticket-intake.ts` ↔ `app/slots.py`).

### Step 2 — move the 8 mock reports to Nepal

Contained. Update `lib/mock-data.ts` coordinates and district names. Replaces the
fictional geography with something the real system will actually have.

### Step 3 — build the map as a pure component

The single most important constraint of this whole plan:

```
components/map/disaster-map.tsx   ← takes Report[] as props
```

It must **not** import from `lib/store.tsx`. That is what makes the later
mock → real swap a one-line data-source change instead of a rewrite. If the map
reaches into the store, mock-first quietly becomes throwaway work.

Port the uncertainty-rendering idea, not the Cesium code: approximate locations
draw as uncertainty halos sized by `radiusKm`, never as hard pins. A responder
driving 25 km to the wrong place is the failure that matters here.

### Step 4 — slot it into the UI

`/reports` already has a `lg:grid-cols-12` layout; the map fits the 9-col span
beside the filters (`app/reports/page.tsx:154`). Add a nav item to `NAV` in
`components/layout/site-header.tsx:36`.

Remember: everything except `app/layout.tsx` and `app/chat/page.tsx` is
`'use client'`. The map will be too, and it cannot export `metadata`.

### Step 5 — real coordinates, when the other team lands

- Geocode `location` server-side. Nominatim is free and keyless; if it returns a
  `boundingbox` that is a *real* uncertainty radius rather than a guessed one.
- Populate `lat`/`lng`/`source`/`confidence` on the ticket, then feed the map from
  the API instead of `lib/mock-data.ts`.

## Risks worth naming now

1. **Geocoding a stressed person's free-text description is unreliable.** "The
   bridge near Ghodeega" during a flood may resolve to the wrong bridge. This is
   why `confidence` and halo rendering are load-bearing, not polish.
2. **Mock data cannot validate the product bet.** Eight fabricated points say
   nothing about whether a responder can find someone. Don't let a green demo
   become "the map works".
3. **Location privacy.** A live map of individual emergency callers exposes the
   position of people who need help. Decide the audience (dispatcher vs public)
   before the map ships — they are different products and I would not build one
   and assume the other.
4. **Public exposure.** The map adds a geospatial surface to an app that is
   currently open except `/reports`. `middleware.ts` gates only `/reports/:path*`,
   deliberately — widening it is a real decision, not a detail.

## What is NOT in this plan

- Tailwind/TypeScript migration — the repo already has both
- Region-agnostic map support
- The upstream hazard feeds from the separate `gvsdemo` poller (USGS/GDACS/FIRMS/
  DHM). That project has a live poller, SQLite and an SSE stream, but the user's
  stated purpose here is *where emergency reports come from*, which is ticket
  data, not hazard feeds. Raise it if that changes.
