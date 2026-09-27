# FLARE AI backend

A small FastAPI service that turns a conversation into a relief ticket.

The reporter talks (or types) about what is happening. The service asks for
whatever it is still missing, extracts the answers, and refuses to create a
ticket until every required attribute is present. A review step lets the
reporter read and edit the draft before anything is written, and the ticket
lands in Postgres for the response team to pick up.

- **Frontend:** the Next.js app in the repo root, which talks to this service
  through its own `/api/ai/*` proxy routes. The Gemini key never reaches a
  browser.
- **Model:** Gemini, constrained to a JSON schema so the answer parses. The
  model is never trusted to decide whether a ticket is complete — that is
  computed in `slots.py`.

## The rule this service exists to enforce

A ticket is only written when it has all of:

| # | Attribute | Required when |
|---|-----------|---------------|
| 1 | Reporter name | always |
| 1 | Reporter contact number | always (must be dialable) |
| 2 | Victim name | a relative is filing for someone else |
| 2 | Victim contact number | a relative is filing for someone else |
| 3 | Summary of what the reporter described | always |
| 4 | Creation timestamp | stamped server-side at insert, never by the model |
| 5 | Location of the victim | always |
| 6 | Support classification | always, at least one of the four classes |

The four support classes:

| Class | Meaning |
|-------|---------|
| `rescue` | trapped, stranded, or unable to get out on their own |
| `relief-supplies` | food, clean water, clothing, blankets, a safe place to sleep |
| `medical` | injury, sudden illness, or a health need that cannot wait |
| `security` | unsafe because of other people — violence, theft, armed threat |

A ticket can carry several classes at once; someone who is injured and has
nowhere to sleep needs both an ambulance and shelter.

## Running it

### With Docker

```bash
cp .env.example .env          # then put your Gemini key in it
docker compose up -d db       # Postgres only — enough to develop the frontend
docker compose up -d          # or the whole thing, db + api
```

`ai` is optional when you only need the database: run `docker compose up -d db`
and point the service at it with a local virtualenv instead.

### Without Docker

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
docker compose up -d db       # still the easiest way to get Postgres
uvicorn app.main:app --reload --port 8000
```

`./dev.sh` does the virtualenv and dependency setup for you.

### Pointing the frontend at it

The root `.env` holds the URL:

```
AI_API_URL=http://127.0.0.1:8000
```

Then start Next.js as usual. If the service is not running, the chat still
works — replies come from the scripted offline set and are labelled as such.

### Checks

```bash
curl localhost:8000/api/ready
```

```json
{
  "status": "ready",
  "checks": { "gemini_key": true, "database_configured": true, "database_connected": true },
  "models": ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-2.5-flash"]
}
```

```bash
.venv/bin/python -m pytest app/tests -q   # 170 tests, no model calls, no quota
```

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/health` | Liveness. Does not touch Gemini or Postgres. |
| `GET` | `/api/ready` | Readiness, with per-dependency detail. |
| `POST` | `/api/chat/message` | One assistant turn. Returns the draft, per-slot state, what is still missing, and up to two follow-up questions. |
| `POST` | `/api/tickets` | Create a ticket. Re-validates every required attribute first and answers `422` naming exactly what is missing. |
| `GET` | `/api/tickets` | List, newest first. Accepts `?status=`, a repeatable `?support=` (any-of), `?limit=` and `?offset=`. |
| `GET` | `/api/tickets/{id}` | Fetch one. |
| `PATCH` | `/api/tickets/{id}/status` | Move it through the review queue. |
| `GET` | `/api/tickets/stats` | Counts by status, urgency and support class. |

The admin endpoints are reached through the Next.js proxy, which is their only
access control — this service authenticates nothing itself, so it must stay on a
private network. `/admin` in the front end is the queue built on the list and
status endpoints.

## How a turn works

1. The full transcript plus any hand-edited fields go to Gemini with a JSON
   response schema and `thinkingBudget: 0`.
2. The reply is parsed defensively — bad fields are dropped one at a time until
   the draft validates, so one stray token costs one slot instead of the whole
   ticket.
3. Hand edits are overlaid last. The human always wins.
4. `missing_slots()` recomputes readiness from scratch. The model is never asked
   whether the ticket is ready.

If Gemini is unavailable, the turn is served **degraded** rather than failing:
the reporter still gets a question, the flag `degraded: true` comes back, and the
UI labels the answer as an offline reply. Hand edits are preserved on that path
too — an outage must not cost someone the detail only they knew.

### Model fallback

`GEMINI_MODELS` is tried in order, so a single model being unavailable does not
take the intake down. `gemini-3.8-flash` is the best of the three but returns
429/503 under load, which is why 3.5 and 2.5 are in the list.

## Layout

| File | Role |
|------|------|
| `app/slots.py` | The required-attribute rule. Pure functions, no I/O. |
| `app/prompts.py` | The interview spec and the JSON response schema. |
| `app/gemini.py` | Gemini client, model fallback loop, JSON decoding. |
| `app/chat_service.py` | One turn: call, parse defensively, apply edits, compute readiness. |
| `app/db.py` | Schema creation and the ticket store. |
| `app/schemas.py` | Wire contracts. `SlotName` values are camelCase; fields are snake_case. |
| `app/routers/` | HTTP layer, thin. |

## Notes for whoever works on this next

- **`slots.py` is duplicated in `lib/ticket-intake.ts`** so the review form can
  show what is missing while the user types, without a round trip. The backend is
  authoritative. If you change one, change both — the tests in
  `app/tests/test_intake_rules.py` pin the rules that must not drift.
- **`SlotName` values are camelCase; the model and the database are
  snake_case.** `missing` and `next_questions` use the camelCase slot names as
  keys. The client depends on this.
- **The key is server-side only.** It is in `.env` (gitignored). Nothing here
  should ever return it, and it must not be moved into a `NEXT_PUBLIC_` variable
  to "fix" a connection problem.
- **`peopleAffected` is a string** in the draft because "the two of us" and
  "about 12" are both valid answers. Postgres coerces it to an integer on
  insert.
