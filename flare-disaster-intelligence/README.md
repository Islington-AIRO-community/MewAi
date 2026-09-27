# FLARE — Disaster Intelligence Layer

> **Milestone 2B status: complete and verified.** Milestone 1 (foundation +
> flood intelligence) is locked. Milestone 2 added a minimal agent-facing tool
> contract; 2B adds a deterministic free-text layer in front of it, so a plain
> sentence becomes a real assessment. 474 hermetic tests + 12 opt-in live API
> tests, all passing.

`FLARE` analyses live model-grid data to estimate flood conditions for
Nepalese locations and decide whether an alert should be issued. It is the
**Disaster Intelligence Layer** of the wider project: it produces
intellectual-property-safe, structured alert information and hands it to the
**Post-Disaster Relief Network** over HTTP/JSON.

**This is a transparent prototype, not a calibrated warning system.** Read
[`PROJECT_STATE.md`](PROJECT_STATE.md) before quoting any number from it.

---

## What it does

```
Open-Meteo Forecast API ─┐
                         ├─→ collection → validation → features → risk score
Open-Meteo Flood API ────┘        (failure        (numbers)   (0 … 1)
                                taxonomy)                     │
                                                                ▼
                             ┌───────────────────────────────────────────┐
                             ▼                    ▼                    ▼
                     threat level          alert decision      evidence trail
                  LOW / MODERATE /        publish or          every value,
                   HIGH / CRITICAL        suppress           weight, band
                             │                    │                    │
                             └────────────────────┴────────────────────┘
                                                  │
                                                  ▼
                              IntelligenceEvent  (contract v1.0.0)
                                        │              │
                                   CLI (main.py)    API (api.py)  ──▶  Relief Network
```

Three stages are deliberately kept apart, because they answer different
questions:

| Stage | Question | Module |
| --- | --- | --- |
| **Risk** | How severe are current conditions? | `risk/flood.py` |
| **Threat** | How does that score map to a level? | `risk/threat.py` |
| **Alert** | Should anyone actually be told? | `risk/alert.py` |

A high risk score does **not** automatically produce an alert — see
[Alerting](#alerting).

---

## Quick start

```bash
python -m pip install -r requirements.txt
```

### Live assessment

```bash
python main.py --location kathmandu
python main.py --location butwal --json
```

### No network? Use the synthetic scenarios

```bash
python main.py --offline --scenario severe
python main.py scenarios          # what the offline scenarios contain
```

`--offline` uses `demo/scenarios.json` and **never** touches the network. Every
result it produces is labelled `origin: "synthetic_demo"` and
`is_synthetic: true`, at both the run level and each individual data source, so
demo output can never be mistaken for an observation.

### Inspect the methodology

```bash
python main.py thresholds      # every threshold, weight and band
python main.py scenarios       # the synthetic scenarios and their expectations
python main.py locations       # the five assessable demo locations
```

### HTTP API

```bash
uvicorn api:app --reload
```

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | liveness; makes no network call |
| GET | `/v1/thresholds` | all thresholds + calibration status |
| GET | `/v1/locations` | assessable demo locations |
| GET | `/v1/scenarios` | synthetic scenarios, flagged non-live |
| GET | `/v1/contract` | JSON Schema of the output contract |
| GET | `/v1/flood?location=kathmandu` | **live** assessment |
| GET | `/v1/flood?location=kathmandu&fallback_synthetic=true` | live, but fall back to synthetic if a source fails |
| GET | `/v1/flood/offline?scenario=severe` | synthetic assessment, no network |
| GET | `/demo/earthquake` | original prototype earthquake path |

---

## Risk method

Four indicators, each normalised into `[0, 1]`, then weighted. **This is a
rule-based composite index — no model is trained, fitted or used.** All
thresholds are documented assumptions, not official Nepal warning levels.

| Indicator | Feature | Band | Weight |
| --- | --- | --- | --- |
| Antecedent rainfall | past 72 h precipitation (model-derived) | 20 → 120 mm | **0.30** |
| Forecast rainfall | next 72 h precipitation | 20 → 120 mm | **0.15** |
| Discharge level | today's modelled discharge | 30 → 400 m³/s | **0.35** |
| Discharge rise | today ÷ past baseline | 1× → 4× | **0.20** |

Missing indicators are dropped and the remaining weights are renormalised:

```
coverage   = Σ weight of available indicators
risk_score = Σ (weight × normalised) / coverage
```

Every result therefore publishes its `coverage` alongside its `risk_score`, so a
score derived from 45% of the indicators can never be mistaken for a complete
one. All bands live in `risk/config.py` — one file, no magic numbers elsewhere.

### Threat levels

| Level | Score | Alert? |
| --- | --- | --- |
| `LOW` | `[0.00, 0.25)` | no |
| `MODERATE` | `[0.25, 0.50)` | no — recommendation `monitor` |
| `HIGH` | `[0.50, 0.75)` | yes, if coverage is complete |
| `CRITICAL` | `[0.75, 1.00]` | yes, if coverage is complete |
| `UNKNOWN` | no score | no — recommendation `acquire_data` |

`UNKNOWN` is not a fifth severity level. It means *nothing could be assessed*, so
that missing data is never displayed as "no risk".

### Alerting

An alert is published only when the threat level is `HIGH` or `CRITICAL`
**and** indicator coverage is **100%**. A qualifying result computed from partial
data is returned with `alert: false`, `suppressed: true` and
`requires_manual_verification: true` instead of being published — turning
rainfall into a flood warning without a calibrated rainfall–flood relationship is
the step that most needs real data, so it is escalated to a human rather than
guessed at.

### Why there is no `confidence` field

There is no trained model, no calibrated probability and no validated outcome
data, so any confidence number would be invented. Instead the contract carries
`data_quality`: which indicators were used, what fraction of the intended weight
that represents, whether the data was live or synthetic, and every processing
warning. A fact about the inputs, not a prediction about the future. A test walks
the generated JSON Schema and asserts no `confidence`, `probability` or
`likelihood` property ever appears.

Verified against the published schema: the eleven top-level properties are
`contract_version`, `event_id`, `disaster_type`, `location`, `risk_score`,
`assessment`, `data_quality`, `message`, `evidence`, `timestamp` and
`observation_timestamp`. No forbidden property exists at any nesting depth. The
word "confidence" appears once, inside the `data_quality` description — "Not a
confidence score" — which is the disclaimer rather than a field.

---

## What it will not tell you

- **Not machine-learned.** No training, no fitting, no measured accuracy.
- **Not Nepal-calibrated.** The bands are assumed values, not NDRRMA or DHM
  thresholds.
- **Not validated.** Nothing here has been compared against a record of what
  actually flooded.
- **Not gauge-verified.** Discharge is a GloFAS model value for the nearest
  modelled river reach.
- **Not observed.** Every number is model output on a grid. Rainfall is snapped
  to a weather grid cell and discharge to a modelled reach, both supplied by
  Open-Meteo. The "past" part of each series is the model's own hindcast for
  elapsed hours, **not** a station or radar reading. Nothing in this project
  consumes a physical measuring instrument.
- **Daily only.** The source has no hourly discharge; it returns HTTP 400 if
  asked. Flash flooding on small urban channels is invisible to this pipeline.
- **No exposure.** A quiet location full of people still scores as quiet.

Full limitations list: [`PROJECT_STATE.md` §14](PROJECT_STATE.md).

---

## Resilience

Failures are **classified, not hidden**. `collectors/base.py` distinguishes the
six collector-level reasons `timeout`, `network_unreachable`, `http_error`,
`invalid_request`, `malformed_json` and `unexpected_payload`; it retries
timeouts, 5xx and network errors, and never retries a 4xx. The pipeline adds two
statuses of its own, `empty_payload` (a collector answered but delivered
nothing) and `unexpected_error` (a collector raised something unclassified).

The pipeline then degrades instead of collapsing:

| Situation | Result |
| --- | --- |
| Both sources OK | full assessment, `coverage: 1.0` |
| One source fails | partial assessment, `origin: "partial"`, alert suppressed |
| Both sources fail | `UNKNOWN`, `alert: false`, `recommendation: "acquire_data"` |

A failing upstream is deliberately **not** an HTTP 502: the relief network needs
to know whether there *is* a flood, so a 200 with a degraded `data_quality` block
is more useful than an error page. Only unusable *requests* return 4xx.

Because the pipeline records failures instead of raising, `--fallback-synthetic`
decides whether to fall back by inspecting the result, not by catching an
exception. It falls back only when the live attempt produced nothing usable —
a **partial** live result is kept, since real degraded data beats a synthetic
scenario. With `fallback_synthetic=false` the API returns 503 in the same
situation.

---

## Testing

```bash
python -m pytest                                            # 474 unit, no network
$env:FLARE_LIVE_TESTS="1"; python -m pytest tests/test_live_api.py   # 12 live
```

The unit suite never touches the network — the HTTP transport is faked, and
`tests/conftest.py` installs a session-level guard that blocks any non-loopback
socket, so a test that accidentally reaches a public API fails loudly instead of
quietly depending on a third party. The live suite is opt-in and skipped by
default, so a flaky third-party service can never falsely report the pipeline as
broken.

Latest verified run (2026-09-27, Windows, Python 3.14.7):

```
474 passed, 12 skipped  (~2.1s)       # the 12 skips are the live tests
  12 passed             (18s)          # real calls to Open-Meteo and USGS, all green
```

The `severe` scenario scores `0.913`, which was derived by hand from the
published formula before the code was run and reproduced exactly — the strongest
evidence available at this milestone that the engine is genuinely transparent
rather than accidentally correct.

---

## Layout

| Path | Role |
| --- | --- |
| `main.py` | CLI entry point |
| `api.py` | HTTP/JSON interface (the integration surface) |
| `pipeline.py` | orchestration of the whole flow |
| `collectors/` | external I/O: `base` (shared HTTP), `weather`, `flood`, `earthquake` |
| `processing/` | `validation` (coercion, time) → `flood_features` |
| `risk/` | `config` (all thresholds) · `flood` · `threat` · `alert` · `earthquake` |
| `schemas/` | `events.py` — the output contract |
| `demo/` | synthetic scenarios (`scenarios.json`, `fixtures.py`) |
| `agent/` | Milestone 2 / 2B — `tool.py` (contract) · `agent.py` (deterministic agent) · `parser.py` (free text → request) · `__main__.py` (demo) |
| `tests/` | unit, API, agent and opt-in live tests |

`collectors/earthquake.py` and `risk/earthquake.py` are the **original prototype**
earthquake path, left exactly as they were. Expanding earthquake, and adding
landslide, wildfire and severe weather, are later milestones.

---

## The agent tool contract (Milestones 2 and 2B)

An agent can ask for disaster intelligence without touching the flood-risk
implementation. It names a disaster type and a coordinate; it gets back the
**existing** `IntelligenceEvent`.

```
USER
  ↓
PARSER          agent/parser.py   parse_user_input() — 3 fields, regex only
  ↓                              (Milestone 2B; the whole sentence is optional)
AGENT           agent/agent.py    handle_request() — asks for what is missing
  ↓
TOOL            agent/tool.py     run_intelligence_tool() — validates
  ↓
PIPELINE        main.run_flood_live() / run_flood_offline()   [unchanged]
  ↓
IntelligenceEvent   schemas/events.py   contract v1.0.0 — the real object
  ↓
AGENT           agent/agent.py    renders one readable sentence
  ↓
USER
```

```python
from agent import handle_request, handle_text, IntelligenceRequest

# a whole sentence works now (Milestone 2B)
print(handle_text("Check flood risk at 27.7172, 85.3240", mode="offline").message)

# or name the fields directly
reply = handle_request(
    IntelligenceRequest(
        disaster_type="flood", latitude=27.7172, longitude=85.3240, mode="live"
    )
)
print(reply.message)     # human-readable
print(reply.event)       # the untouched IntelligenceEvent
```

Both paths are the *same* path: the parser only fills in three fields, and a
test asserts the two produce a byte-identical answer.

Try it without writing any code:

```bash
python -m agent                                # offline, Kathmandu
python -m agent --lat 27.7172 --lon 85.3240    # offline, any point
python -m agent --live                         # real Open-Meteo + GloFAS
python -m agent --capabilities                 # what is and isn't supported

python -m agent --text "Check flood risk at 27.7172, 85.3240"
python -m agent --text "Check earthquake risk at 27.7172, 85.3240"
python -m agent --text "what is the flood risk" --live
```

What it deliberately is **not**:

- **Not a second event schema.** On success the tool returns a real
  `IntelligenceEvent` built by the unchanged Milestone 1 pipeline.
- **Not a risk model.** Neither the tool nor the parser imports `risk/flood.py`;
  a test asserts this from the AST.
- **Not an LLM.** The agent is a comparison tree and the parser is a table of
  regular expressions, so both are pinned by tests rather than by a prompt. A
  model can later be offered *in front of* the parser; nothing below it changes.
- **Not general language understanding.** The parser recognises 26 named disaster
  types and takes exactly two finite decimals as a coordinate. A place name is
  not a location, and a sentence with three numbers is asked about rather than
  guessed at.
- **Not geocoding.** Coordinates only. There is no place name and no address
  lookup, and `Location.country` still defaults to `"Nepal"` for every point —
  see [`PROJECT_STATE.md` §13.24](PROJECT_STATE.md).
- **Not multi-hazard.** Only `flood` is supported. `earthquake` returns an
  explicit *unsupported* response, because `assess_earthquake()` produces a bare
  `dict` rather than the contract, and routing to it would mean inventing a
  competing result shape. The parser never answers an unsupported hazard with a
  flood assessment.

Full interface reference: [`PROJECT_STATE.md` §18](PROJECT_STATE.md) for the tool
contract, [§19](PROJECT_STATE.md) for the parser.

---

## The seam to the Relief Network

This layer has **no import, no shared state and no knowledge** of the Relief
Network team's code. The single integration point is the `IntelligenceEvent`
object, published at contract version `1.0.0` and described in full at
`GET /v1/contract`. The endpoint seam is intended to be fixed before either side
builds on it.

---

## Next

The largest gap between this prototype and a credible flood-warning system is
that its numbers are assumed rather than measured. So the recommended next
milestone is **Nepal-calibrated thresholds and a first genuinely trained model**,
not another hazard type.

For the agent track, the free-text layer is done (§19). The next agent step is
deciding the `Location.country` question and then harmonising earthquake onto
the contract — see [`PROJECT_STATE.md` §17](PROJECT_STATE.md).
