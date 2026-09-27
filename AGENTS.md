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

Node 20+ (developed on 22). There **is now** a JS test suite — `vitest`, added for
the Gemini Live protocol rules. It is deliberately tiny: one file,
`lib/live-voice/session.test.ts`, running in a `node` environment with no jsdom.

```bash
npm test             # vitest run
npm run test:watch
```

It exists because those rules fail *silently* — a cumulative transcript read as
incremental produces a rambling reporter, and an incremental one read as
cumulative produces the last word of every sentence. Neither looks like a bug,
so they are asserted rather than described. Everything else in the front end is
still verified only by `typecheck` + `lint` + `build`; all three pass clean, so
treat any new output from them as a regression you introduced.

`build` already runs lint and typecheck, so run `build` alone as the full gate.
Note it is `build` — not `test` — that catches types in the test files too, since
`tsconfig` includes them.

The Python service is separate and **also** has tests:

```bash
cd ai-backend
.venv/bin/python -m pytest app/tests -q   # 153 tests, no model calls, no quota
./dev.sh                                 # venv + deps + uvicorn on :8000
docker compose up -d db                  # Postgres
```

`pytest.ini` sets `asyncio_mode = auto`, and that is load-bearing rather than
convenient: with **no** asyncio plugin pytest *silently skips* `async def` tests
and reports the suite as green while nothing was asserted. If you add an async
test, check it appears in the collected count — `.venv/bin/python -m pytest
app/tests --collect-only -q | tail -1`.

If `python -m venv` appears to hang building `pydantic-core`, the interpreter is
probably 3.14 and there is no wheel for it yet. Use 3.12:
`uv venv --python 3.12 .venv`.

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
3. **Only three subtrees are gated, and where they split is a product
   decision, not an oversight.** `middleware.ts` matches `/reports/:path*`,
   `/tickets/:path*` and `/admin/:path*`. `/`, `/dashboard`, `/chat`,
   `/resources` and the whole SOS flow stay open, because putting a Google
   round-trip in front of someone asking for help during a disaster is a real
   harm — outages are exactly when this app matters, and the person may have no
   Google account or no route to Google's servers. The three gated subtrees are
   gated for two different reasons: `/reports` and `/tickets` exist *because* of
   an account, and `/admin` exists because of an allowlist. **Widening the
   matcher to cover intake is the change to think hard about, not make casually.**

### The gate is a redirect, not authorization

`middleware.ts` is a UX redirect and nothing more; a matcher can be routed
around, and every check that matters also runs on the response path in
`app/api/ai/_session.ts`. Do not describe the redirect as securing anything.

What each gate is actually for:

- `/reports` — still mock data in `useState`, resets on refresh, and has no
  user-scoped data to protect. The gate implies a persistence this app cannot
  yet deliver. It becomes real access control when the deferred `users` table
  lands.
- `/tickets` and `/tickets/:id` — **this one is real.** These read Postgres rows
  that carry a reporter's name, phone number and address, and the portal shows
  them back to whoever is signed in. The API re-derives the address from the
  httpOnly cookie and never from the request, so a signed-out visitor gets a 401
  rather than an empty list they might mistake for "no tickets".
- `/admin` — an `ADMIN_EMAILS` allowlist. Unset admits nobody, so a deployment
  that forgets it is locked rather than open. There is no role table behind it.

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
3. **The wire format is split, and the `draft` is snake_case — this line was
   previously wrong here and the tests caught it.** The response *envelope* is
   snake_case (`next_questions`, `is_complete`, `safety_note`), the `draft`
   object is **also** snake_case (`reporter_name`, `victim_phone`,
   `support_needed`, `on_behalf_of_other`), and only `missing`/`next_questions`
   use camelCase `SlotName` values as *keys*. `lib/ai-client.ts` translates all
   of this into the camelCase TypeScript shapes; don't rename the wire. The
   asymmetry is pinned in `ai-backend/app/tests/test_chat_response.py`, which
   asserts the exact JSON keys a real `TestClient` emits, because a draft read
   with the wrong casing does not error — it just renders an empty review form
   and offers a complete-looking ticket with no summary.

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

### A filed ticket is the only durable thing in the system

Everything in `lib/store.tsx` dies on refresh. A ticket row in Postgres does not,
which makes the ticket — not the report, not the chat transcript — the thing this
app actually keeps. Three pages hang off it:

```
/tickets          the reporter's own list, gated on a Google session
/tickets/[id]     one ticket: its status, and a follow-up conversation
/admin            the response queue, gated on ADMIN_EMAILS
```

`lib/ticket-portal.ts` is the typed client for all three. It **resolves rather
than rejects** on every failure, the same contract as `lib/ai-client.ts`, and
the `PortalError` kinds are the whole vocabulary: `not_signed_in`, `forbidden`,
`not_found`, `unreachable`, `unavailable`, `unknown`.

**Status is the database's, and only an operator's.** The reporter's assistant is
handed the status and asked what it *means*; it is never asked what the status
*is*. The only writer is `PATCH /api/tickets/{id}/status`, reached from
`/admin`. So a follow-up reply can never say "a crew is on the way" while the
row still says `submitted` — which is the single worst output this backend could
produce. `test_follow_up.py` pins that with a model that is explicitly told to
lie about the status.

### The admin queue's filters are in SQL, and the allowlist is why

`/admin` filters by status and by support type, and both are query parameters
that have to clear **three** hops, each of which will silently drop a new one:

```
app/admin/page.tsx            fetchAdminQueue({ status, support })
  → lib/ticket-portal.ts      one `support=` per selected chip
  → app/api/ai/admin/tickets  allowlist: forwards limit, status, support — nothing else
  → GET /api/tickets          `&&` overlap in SQL
```

The middle hop is the one to remember. `app/api/ai/admin/tickets/route.ts`
forwards an explicit allowlist and drops everything else, on purpose, so a
caller cannot reach a different upstream route. A filter that is not on that list
does not error — the control renders, the request returns 200, and the list comes
back unfiltered, which reads as a backend bug. **Adding a filter means adding its
param there, not just upstream.**

- **Support filtering is `support_needed && $n`, an array overlap, not `=`.**
  `support_needed` is a `text[]` and a ticket can need medical *and* rescue, so
  equality would drop exactly the multi-need tickets a responder opens the filter
  to find. Selecting several types is the union in one predicate, never two
  clauses — two clauses would be an intersection, the opposite of the chips.
- **The clause list in `TicketStore.list` exists because of placeholder
  numbering.** `LIMIT`/`OFFSET` are numbered after whatever the filters bound, so
  growing the query by appending to a single `where` string is how a `$2` ends up
  bound to a text column. `test_admin_filters.py` pins the emitted SQL and args,
  because this breaks by returning the wrong rows with no error anywhere.
- **`total` is untruncated and the list is not.** The proxy caps the queue at
  100 rows, so the page says "100 of 143" rather than implying it showed 143. A
  responder reading 100 as "everything" stops looking past the last row.
- **The stats panel is deliberately *not* filtered.** `fetchAdminStats()` takes
  no arguments, so "Medical 12" above a list of the 2 medical tickets that are
  still submitted would read as a bug. The counts describe the whole queue and
  the panel says so; the chips carry no counts at all.

### Ownership: who is allowed to read a ticket

A ticket holds a name, a phone number, an address, and sometimes someone else's.
The ids are sequential (`TKT-000001`, …), so any endpoint that answers "not
yours" differently from "no such ticket" is an enumeration oracle over the whole
table.

- **The owner comes from the `x-ticket-owner` header, never from a request
  body.** `TicketCreate.owner_email` exists only so the proxy can pass the
  session address through, and `create_ticket` overwrites it from the header
  before inserting. This is not belt-and-braces: reading ownership off the
  payload let *any* direct caller file a ticket as a victim and then read their
  whole queue through `/api/tickets/mine`. It was a live bug, caught by
  end-to-end testing, and `test_ticket_ownership.py` now pins the header as
  authoritative.
- **A ticket filed signed out belongs to nobody** — therefore to no caller,
  including whoever filed it. Anonymous intake is a real and supported path; it
  just has no portal *until the reporter claims it* (below).
- **Wrong owner and missing ticket are both 404**, never 403.
- The reporter's **name and phone are deliberately absent from the prompt text**
  (`_ticket_facts`), even though the row has them. That text goes to a model; a
  reply quoting someone's number back at them is a leak that buys nothing.

### Claiming an orphan is the only write to `owner_email` after insert

`POST /api/tickets/claim` lets a signed-in reporter attach a ticket they filed
signed out, proving it with **the phone number they gave when they filed it**.
Without it they hold a reference code and no way to use it, which is a worse
outcome than asking for a login up front.

Three things make it safe, and all three are load-bearing:

- **The guard is in the SQL, not in Python.** `TicketStore.claim` is a single
  `UPDATE … WHERE id = $2 AND owner_email IS NULL AND reporter_phone = $3`. A
  read-then-write looks equivalent and is not: two callers racing for the same
  orphan would both read `NULL` and the second write would win. It reads as an
  ordinary `UPDATE` at a glance, so it is the thing most likely to be
  "simplified" into a bug — don't.
- **`owner_email IS NULL` is what stops account takeover.** Without it, sign in
  as anyone, name a victim, produce their phone number, and take their ticket.
  It also makes a second claim a no-op, so the loser of a race gets a 404.
- **The phone is compared after `normalise_phone`.** It is normalised on insert,
  so the row holds `07700900123` whatever the reporter typed. Comparing raw
  strings would tell someone who retypes `07700 900 123` that their ticket does
  not exist, during a disaster, with no other way to find out what is happening.

The account comes from the `x-ticket-owner` header, never the body, so a caller
can only claim *for themselves*. **Every failure returns one fixed string** — no
id echoed, so a wrong phone cannot be told from a wrong reference. An earlier
version echoed `No ticket with id {id}.` and the test caught it; that reasoning
("the id is the caller's own input") is wrong, because a wrong phone on a real
reference and a wrong reference then produce different sentences. The proxy
answers malformed input with 404 rather than 422 for the same reason.

Not yet done: rate limiting. The reference is guessable and the phone is 10
digits, so practical online guessing is the only thing stopping a determined
caller. Revisit before this faces the public internet.

### The backend's own auth is the proxy, and only the proxy

`AI_API_URL` never reaches the browser, so `app/api/ai/admin/*` running
`requireAdmin()` server-side *is* the access control for the admin endpoints.
That means **`ai-backend` must stay on a private network** — its `GET
/api/tickets` and `PATCH /{id}/status` enforce nothing by themselves. If you
ever bind it to a public interface, add the check in the router first. The
owner-scoped endpoints are the exception: they check `x-ticket-owner`
themselves, because the secret decides who may read PII.

**Voice is the one path that does not go through the proxy for its media.**
`POST /api/live/token` mints a short-lived, single-use Gemini token, and the
browser then opens a `wss://` socket to Gemini *directly* — audio never passes
through our servers. The practical consequences:

- The backend's own `/api/live/token` needs no session check, but it does spend
  quota on every call, which is why the Next route caps it per IP. Widen that
  cap only with a reason; it is the only thing between a public page and a
  billable endpoint reachable by anyone with `curl`.
- The `GEMINI_API_KEY` still never leaves the backend. The browser gets a
  scoped token, not the key, and `test_live_e2e.py` asserts the key is absent
  from the URL it hands out.
- Because the socket is direct, a Next redeploy or a 502 from `_shared.ts`
  cannot kill a voice session already in progress — and a *reconnect* after a
  token expires needs a fresh mint, not a reused token. Tokens are single-use;
  `uses: 1` is set server-side and a resume reuses the original token.
- Everything else still goes through the proxy. Voice is not a precedent for
  routing ticket reads around it.

### The Live protocol rules are pinned, not described

`lib/live-voice/session.ts` is a state machine over the Gemini socket, and its
rules were reverse-engineered by watching a real connection rather than read off
a schema. They are pinned in `lib/live-voice/session.test.ts` (31 tests) because
each one fails silently. If you change that file, expect the tests to argue.

- `inputTranscription` is **cumulative** — keep the latest value.
- `outputTranscription` is **incremental** — concatenate fragments.
- A turn ends on `voiceActivity.endOfSpeech`, **not** `turnComplete`, which the
  service does not reliably send. Waiting for it drops the last turn, which is
  routinely the location.
- `interrupted: true` discards the partial assistant turn *and* flushes queued
  audio. It is what stops the reporter being told a crew is on the way when it
  is not.
- The session is always-on: stream silence continuously and never send
  `audioStreamEnd` between turns, or the service decides the reporter finished.
- **Input audio goes out as `realtimeInput.audio`, never `realtimeInput.mediaChunks`.**
  `mediaChunks` is deprecated. On **v1beta** the service rejects it by name
  (`realtime_input.media_chunks is deprecated. Use audio, video, or text
  instead`) — which is how it was found. On **v1alpha**, the version we pin for
  `proactivity`, it is far worse: the frame is *accepted and silently
  discarded*. Every microphone sample went nowhere, the model heard pure
  silence, VAD never fired, and it never spoke — with `setupComplete` arriving,
  the status reading "Listening", the waveform animating, and no error or log
  line on either end. The text path has the same trap: `realtimeInput.text` is a
  bare string, and `clientContent` has **no** `parts` field at all.
- **A deprecated field that the pinned API version quietly ignores is the worst
  shape a protocol bug can take.** It cannot be found by reading our code, and
  the loud version of it lives on an endpoint we never call.
  `test_service_returns_audio_for_a_turn` exists for that reason: every other
  live test passes on a connected, healthy, completely inert session. That one
  requires audio *back*.
- The client's `setup` is near-empty on purpose. The model, voice, system
  instruction, and turn-taking config are pinned in the token server-side, and
  a client that contradicts them is ignored. A test asserts the client sends
  none of it, because "let the browser pick the model" is the kind of change
  that moves a system prompt into a place the code review stopped looking.
- **The client sends exactly one message: `{"setup": ...}`.** It used to send a
  second, top-level `realtimeInputConfig`. That field is *not a client message* —
  the wire accepts only `setup`, `clientContent`, `realtimeInput`,
  `toolResponse` — so the service replied `1007 Unknown name "realtimeInputConfig"`
  and closed, which reached the reporter as an unexplained "Voice unavailable".
  Turn-taking is pinned in `live_connect_setup()`, which also carries
  `activityHandling: START_OF_ACTIVITY_INTERRUPTS`; a client-side VAD block
  would have overridden that and quietly removed barge-in.
- **A server `error` frame must be surfaced, not swallowed.** The service
  explains itself and *then* closes, so ignoring `error` reduced every config
  rejection to an indistinguishable "the connection dropped". `session.ts`
  logs the service's own message and fails with `kind: 'rejected'`, which is
  terminal and deliberately not retried.
- **The WebSocket close code carries the only evidence of why a socket died**,
  because the socket runs browser→Gemini and nothing on our servers sees it.
  `onclose` reads it, logs it, and puts it in the message. It used to discard
  the event, making 1006 (handshake refused), 1008 (policy) and 1000 (normal)
  one identical sentence.
- Frames may arrive as `ArrayBuffer`, not only as `string` — `binaryType` is
  `'arraybuffer'`. A `typeof data === 'string'` guard discards them silently.

Verified against the live service with the opt-in suite, which is the only way
to check any of the above:

```bash
cd ai-backend
FLARE_LIVE_E2E=1 .venv/bin/python -m pytest app/tests/test_live_e2e.py -q
```

It forces `AF_INET`. Google's host publishes AAAA records, and on a network
with no IPv6 route asyncio takes the AAAA address and never falls back, so the
handshake times out and a healthy service looks broken. Browsers use
happy-eyeballs and are unaffected — it is only the test that needs the hint.

Transcript handling on the Next side: `useAiChat.ingestTranscript()` replays
the whole conversation in **one** `/api/ai/chat` call rather than a call per
spoken turn, so `missing_slots()` sees the same thing either way and the draft
is not rebuilt turn by turn.

### Two failure codes, two different outages

Do not collapse these. The distinction is the whole reason the reporter's
message is still on the record when something breaks:

| Condition | Code | Meaning |
| --- | --- | --- |
| Backend process unreachable | `502` from `_shared.ts` | *our* network to it is down |
| Backend up, database down | `503` from `_store`/`tickets.py` | the ticket cannot be saved, and says so |

A `500` reaching the browser is indistinguishable from a bug in our own code, and
a `503` on a *lookup* would tell a reporter their request does not exist. Both
are pinned in `test_ticket_availability.py`.

Note the asymmetry this leaves: an outage in **Gemini alone** does not block
filing. Chat degrades, and the review form is still reachable — including via
the "I'd rather fill in the form myself" button, which exists because
degraded intake cannot fill slots and so would otherwise be a dead end. But
filing durably needs the backend *and* Postgres. There is no offline queue; do
not let copy imply otherwise.

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

### The capture worklet is tested, because its bug is invisible

`public/pcm-capture.worklet.js` is loaded into a `node:vm` with a stubbed
`AudioWorkletProcessor` and driven with synthetic samples
(`lib/live-voice/pcm-capture.worklet.test.ts`). The microphone is the only part
that needs hardware; framing, resampling and flushing do not.

It is tested because of a bug that looked like a working product. The frame size
was parsed from `processorOptions` and then never assigned, so
`outPos >= this.frameSamples` compared against `undefined` — always false —
`flush()` never ran, and **not one audio sample was ever posted**. The session
connected, `setupComplete` arrived, the waveform animated, the status said
"Listening", and Gemini received pure silence so it never replied. Every signal
the UI could see was healthy; the broken one was the only one it could not.
`audio.ts` was fine. Nothing was logged, because nothing threw.

`audio.ts` and the playback worklet remain untested — those need a real
`AudioContext` and an output device, and a mock would only assert that the mock
works.

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
6. **`_as_bullets` returns a string, so `append` it — never `extend`.**
   `app/follow_up_prompts.py` and `app/prompts.py` each define their own
   `_as_bullets`, and both return one newline-joined `str`. `list.extend(s)` with
   a string splices in its *characters*. The follow-up path shipped the entire
   ticket to Gemini one letter per line, so the model received no usable facts at
   all — silently, and only on follow-ups, because the intake path concatenates
   and was never affected.
7. **A follow-up's question is persisted, then the thread is read back
   *without it*.** `add_message` returns the inserted row, and
   `FollowUpService.reply` filters that `id` out before building the prompt. The
   prompt appends the new question itself, so without the filter the model sees
   the same sentence twice on every turn. Filter by id, not by `[-1]` —
   `messages()` is bounded at 200, so a long thread shifts the tail.

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
ADMIN_EMAILS=
```

`AI_API_URL` is read via `process.env` in `app/api/ai/_shared.ts`; the OAuth
vars are read in `lib/auth.ts` and `middleware.ts`. `ADMIN_EMAILS` is a
comma-separated allowlist for `/admin` and the admin API — unset admits nobody,
so a deployment that forgets it is locked rather than open. None of them is a
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
