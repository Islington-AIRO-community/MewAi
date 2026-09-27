# FLARE Disaster Intelligence — Project State

**Last updated:** 2026-09-27
**Milestone:** 2B — Deterministic Free-Text Request Parsing
**Status:** complete and verified on this machine (Windows, Python 3.14.7)

> This file records **verified facts only**. Anything planned but not built is in
> section 15 (Future Work). Anything that is known to be wrong or incomplete is
> in sections 13 and 14. Nothing in this document is aspirational.

---

## 1. Current Milestone

**Milestone 2B — DETERMINISTIC FREE-TEXT REQUEST PARSING** is implemented,
tested and demonstrable. Milestone 1 remains locked and Milestone 2's contract is
unchanged; no Milestone 1 file was modified.

Implemented and verified in this milestone:

- `agent/parser.py` — a deterministic parser that turns a plain sentence into the
  **existing** `IntelligenceRequest`. Regular expressions, no language model, no
  network, no geocoding.
- `agent/parser.py::parse_user_input()` — pure text → `IntelligenceRequest`.
- `agent/parser.py::handle_text()` — text → `AgentReply`, via the existing
  `handle_request()`, so free text and structured requests share one code path.
- `agent/__main__.py --text` — free text in the demo CLI, offline by default.
- 474 hermetic tests plus 12 opt-in live API tests, all passing.

The exact interface, its parsing rules and its deliberate omissions are in
**section 19**. Section 18 (the Milestone 2 tool contract) is unchanged.

There is **no language model anywhere in this milestone**. A model could later be
offered *in front of* this parser, but it is not needed: the documented phrasings
are handled by a table of regular expressions, so behaviour is pinned by tests
rather than by a prompt.

Explicitly **not** built in this milestone, by instruction: a language model,
place-name geocoding, admin-area resolution, a map, the Post-Disaster layer, any
change to the existing HTTP API, any new disaster model, and any autonomous or
multi-step agent behaviour.

---

## 2. Architecture

The submitted flowchart defines the Disaster Intelligence Layer as:

```
Historical + Live Data → Data Collection → Data Processing → Disaster-Specific
Data → Specialized Prediction Models → AI Agents → Risk Assessment → Threat
Level → Alert Decision → Alert / Warning
```

The implementation maps onto that flow as follows. Stages that are out of scope
for Milestone 1 are marked, not faked.

| Flowchart stage | Implementation | Milestone 1 status |
| --- | --- | --- |
| Historical + Live Data | Open-Meteo `past_days` gives the model's hindcast for elapsed hours alongside the forecast. Both are model output on a grid, **not observations** | **Done** |
| Data Collection | `collectors/` | **Done** |
| Data Processing | `processing/` (validation + feature extraction) | **Done** |
| Disaster-Specific Data | `processing/flood_features.py` → `FloodFeatures` | **Done** |
| Specialized Prediction Models | *Not implemented.* Replaced by a transparent rule-based risk engine, correctly labelled as not-ML | **Deliberately substituted — see §8** |
| AI Agents | *Not implemented.* No LLM or agent framework exists in this codebase | **Out of scope, reported** |
| Risk Assessment | `risk/flood.py` | **Done** |
| Threat Level | `risk/threat.py` | **Done** |
| Alert Decision | `risk/alert.py` | **Done** |
| Alert / Warning | `schemas/events.py` `IntelligenceEvent` | **Done** |

Inter-layer connection, per
`ASSESSMENTS/FLOWCHART/Phase-01/Connection_Between_Two_Layers.drawio`
(`Disaster Intelligence Layer → Threat / Alert Information → Post-Disaster
Relief Network`), is provided as HTTP/JSON. This layer has **no import, no
shared state and no coupling** to the Relief Network team's code.

---

## 3. Directory / File Map

```
flare-disaster-intelligence/
├── api.py                     HTTP/JSON interface (integration surface)
├── main.py                    CLI entry point
├── pipeline.py                end-to-end orchestration
├── pytest.ini                 test config + `live` marker
├── requirements.txt
├── README.md
├── PROJECT_STATE.md           this file
│
├── collectors/                external data collection (I/O only)
│   ├── base.py                shared HTTP client + failure taxonomy
│   ├── weather.py             Open-Meteo Forecast API
│   ├── flood.py               Open-Meteo Flood API (GloFAS)
│   └── earthquake.py          USGS feed (original prototype, unchanged)
│
├── processing/                data validation + transformation
│   ├── validation.py          safe numeric coercion, time parsing
│   └── flood_features.py      raw payloads → validated FloodFeatures
│
├── risk/                      hazard-specific assessment
│   ├── config.py              ALL thresholds, weights, bands (single source)
│   ├── flood.py               transparent flood risk engine
│   ├── threat.py              risk score → LOW/MODERATE/HIGH/CRITICAL
│   ├── alert.py               threat + data quality → alert decision
│   └── earthquake.py          original prototype, unchanged
│
├── schemas/
│   └── events.py              output contract (pydantic models)
│
├── demo/                      SYNTHETIC data — not observations
│   ├── scenarios.json         5 hand-written scenarios + warning header
│   └── fixtures.py            materialiser (offsets → API-shaped payloads)
│
├── agent/                     Milestone 2 / 2B — agent-facing seam
│   ├── tool.py                request/response contract; calls the pipeline
│   ├── agent.py               deterministic 8-step agent; renders the answer
│   ├── parser.py              Milestone 2B: free text → IntelligenceRequest
│   └── __main__.py            `python -m agent` demonstration harness
│
└── tests/
    ├── conftest.py            shared fixtures, payload builders, and the
    │                          session-level outbound-network guard
    ├── test_threat.py         25 tests
    ├── test_alert.py          70 tests
    ├── test_flood_risk.py     31 tests
    ├── test_processing.py     66 tests
    ├── test_collectors.py     23 tests
    ├── test_config.py         28 tests
    ├── test_schemas.py        24 tests
    ├── test_pipeline.py       24 tests
    ├── test_fallback.py       11 tests
    ├── test_api.py            18 tests
    ├── test_demo_fixtures.py  13 tests
    ├── test_agent.py          54 tests (Milestone 2)
    ├── test_parser.py         87 tests (Milestone 2B)
    └── test_live_api.py       12 tests (opt-in, real network)
```

Unit total 474 + 12 live = 486 collected.

---

## 4. Implemented Components

| Component | File | Verified by |
| --- | --- | --- |
| HTTP client with classified failures | `collectors/base.py` | 23 collector tests |
| Rainfall collector | `collectors/weather.py` | 3 live tests + unit tests |
| Discharge collector | `collectors/flood.py` | 3 live tests + unit tests |
| Numeric coercion / time parsing | `processing/validation.py` | 66 processing tests |
| Feature extraction with degradation | `processing/flood_features.py` | 66 processing tests |
| Threshold registry + self-validation | `risk/config.py` | 28 config tests |
| Risk engine (4 indicators, renormalised) | `risk/flood.py` | 31 risk tests |
| Threat classifier | `risk/threat.py` | 25 threat tests |
| Alert decision with fail-safe | `risk/alert.py` | 70 alert tests |
| Output contract | `schemas/events.py` | 24 schema tests |
| Orchestration | `pipeline.py` | 24 pipeline tests |
| CLI | `main.py` | manual + scenario tests |
| HTTP API | `api.py` | 18 API tests |
| Agent tool contract | `agent/tool.py` | 54 agent tests |
| Deterministic agent | `agent/agent.py` | 54 agent tests |
| Synthetic scenarios | `demo/` | 13 fixture tests |

---

## 5. Data Sources

### 5.1 Open-Meteo Forecast API — weather and rainfall

- **Source:** Open-Meteo (open public API, no key required)
- **Purpose:** past and forecast rainfall for the antecedent-rainfall and
  forecast-rainfall indicators
- **Endpoint:** `https://api.open-meteo.com/v1/forecast`
- **Parameters sent:** `latitude`, `longitude`, `hourly=precipitation,rain,precipitation_probability`, `daily=precipitation_sum,rain_sum,precipitation_hours`, `past_days=7`, `forecast_days=7`, `timezone=UTC`
- **Status:** working
- **Verified:** **Yes.** HTTP 200 confirmed on 2026-09-26 from this machine.
  Returned 336 hourly steps (14 days) and 14 daily steps, with
  `utc_offset_seconds == 0`. For a request at `(27.7172, 85.324)` the API
  returned the grid cell `(27.732864, 85.34831)` at 1301 m elevation — 1.74 km
  north and 2.40 km east of the requested point, **2.96 km away**, which is
  exactly why the offset is published in `evidence.model_grid`.
- **Limitations:** a gridded numerical weather model, **not a gauge or radar
  observation**. The `past_days` portion is the model's own hindcast for elapsed
  hours, not a measurement; values are snapped to the nearest model grid cell,
  which can be several km from the requested point (the offset is disclosed in
  the output); forecast skill degrades with lead time, which is why the
  forecast-rainfall indicator carries the lowest weight.

### 5.2 Open-Meteo Flood API (GloFAS) — river discharge

- **Source:** Open-Meteo flood API, backed by ECMWF GloFAS
- **Purpose:** past and forecast river discharge for the discharge-level and
  discharge-rise indicators
- **Endpoint:** `https://flood-api.open-meteo.com/v1/flood`
- **Parameters sent:** `latitude`, `longitude`, `daily=river_discharge,river_discharge_mean,river_discharge_max`, `past_days=7`, `forecast_days=3`, `timezone=UTC`
- **Status:** working
- **Verified:** **Yes.** HTTP 200 confirmed on 2026-09-26 from this machine.
  Returned 10 aligned daily rows for Kathmandu. The row for the current day
  (2026-09-26) read `river_discharge = 35.64 m³/s`, `river_discharge_mean =
  38.89`, `river_discharge_max = 64.16`; the grid cell returned was
  `(27.725006, 85.32501)`, against a requested `(27.7172, 85.324)`.
- **Limitations:**
  - **No hourly discharge.** `hourly=river_discharge` returns **HTTP 400**
    ("Cannot initialize ... from invalid String value river_discharge").
    Verified and pinned by `test_flood_api_does_not_offer_hourly_discharge`.
    Discharge is therefore daily-only in this pipeline; no hourly discharge is
    synthesised.
  - Values are for the **nearest modelled river reach**, not a named gauge, and
    are **not gauge-verified for Nepal**.
  - The "today" row is a partly-elapsed forecast day, not an observation. This
    is flagged as `evidence.measurements.discharge_latest_is_forecast` (verified
    `true` on 2026-09-26).
  - Discharge is a daily mean for a grid reach; it does not resolve flash-flood
    behaviour on small urban channels.

### 5.3 USGS Earthquake GeoJSON feed

- **Source:** USGS, real-time
- **Purpose:** earthquake events (original prototype path)
- **Endpoint:** `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson`
- **Status:** working
- **Verified:** **Yes.** HTTP 200 on 2026-09-26. The `all_day` feed itself
  returned **205 events of every magnitude** (range −0.38 to 6.6);
  `extract_significant_events` then filters at `min_magnitude = 4.5`, and the
  live demo reported **30 events considered**, highest magnitude **6.6** at
  **10.0 km** depth.
- **Limitations:** magnitude/depth heuristic only. No distance attenuation, no
  exposure or population modelling, not Nepal-calibrated. **Not expanded in this
  milestone** — retained so the existing endpoint keeps working.

### 5.4 Synthetic demo scenarios — NOT a data source

- **Purpose:** let the demonstration and the unit tests run with no network
- **Location:** `demo/scenarios.json`, materialised by `demo/fixtures.py`
- **Status:** working
- **Verified:** **Yes.** All 5 scenarios materialise and produce their documented
  outcomes.
- **Provenance guarantees:** every result derived from these fixtures carries
  `data_quality.origin = "synthetic_demo"`, `data_quality.is_synthetic = true`,
  and a per-source `origin` of `synthetic_demo`. Pinned by
  `test_per_source_origin_never_contradicts_the_run_provenance`.
- **Explicit statement:** none of these numbers is an observation of any river or
  any rainfall.

---

## 6. Data Flow

```
Open-Meteo Forecast API ─┐
                         ├─→ collectors/base.fetch_json ─→ raw JSON
Open-Meteo Flood API ────┘        (classified failures)
                                        │
                                        ▼
                         processing/validation.py
                         (coerce, align, discard, count)
                                        │
                                        ▼
                         processing/flood_features.py
                         → FloodFeatures (measured values or None)
                                        │
                    ┌───────────────────┴───────────────────┐
                    ▼                                       │
            risk/flood.py  (assess_flood_risk)              │
                    │  4 indicators → normalise → weight    │
                    ▼                                       │
            risk/threat.py  (classify_threat)               │
                    │  score → LOW/MODERATE/HIGH/CRITICAL   │
                    ▼                                       │
            risk/alert.py  (decide_alert)  ◄────────────────┘
                    │  threat + coverage → alert / suppress
                    ▼
            schemas/events.py  → IntelligenceEvent (contract v1.0.0)
                    │
                    ├──→ main.py   (human-readable CLI)
                    └──→ api.py    (JSON over HTTP) → Post-Disaster Relief Network
```

Failure handling runs alongside this flow: a collector failure is recorded in
`data_quality.sources`, the pipeline continues with whatever data exists, and
the alert stage refuses to publish from partial data.

---

## 7. Flood Intelligence Pipeline

Exact stage-by-stage definition, matching
`pipeline.run_flood_pipeline` (`pipeline.py:56`).

**Stage 1 — Data collection**
1. `get_weather(lat, lon)` → Open-Meteo Forecast API.
2. `get_flood(lat, lon)` → Open-Meteo Flood API.
3. Each wrapped by `fetch_json`, which classifies any failure as one of the six
   collector-level reasons in `FailureReason`: `timeout`,
   `network_unreachable`, `http_error`, `invalid_request`, `malformed_json`,
   `unexpected_payload`. Timeout, 5xx and network errors are retried once; 4xx
   is not. A returned empty object is treated as a failure
   (status `empty_payload`, emitted by the pipeline rather than the enum), not a
   success. An unclassified exception is contained as `unexpected_error`, so a
   collector bug cannot kill the run.

**Stage 2 — Data validation** (`processing/validation.py`)
- `coerce_float` accepts ints, floats and numeric strings; rejects `None`,
  booleans, `NaN`, `±inf`, empty strings, non-numeric strings and containers.
- `coerce_float_list` preserves positions so the time axis stays aligned, and
  counts how many values were unreadable.
- `truncate_to_shortest` aligns a series that disagrees with its own time axis.
- Optional series (`river_discharge_mean`, `river_discharge_max`) are fitted to
  the length of the required series; an absent optional series never shortens a
  required one.

**Stage 3 — Data processing** (`processing/flood_features.py`)
Produces `FloodFeatures`. All windows UTC, relative to an injected `now`:

| Feature | Definition |
| --- | --- |
| `rainfall_past_24h_mm` | Σ hourly `precipitation` over `[now−24h, now)` |
| `rainfall_past_72h_mm` | Σ hourly `precipitation` over `[now−72h, now)` |
| `rainfall_forecast_72h_mm` | Σ hourly `precipitation` over `[now, now+72h)` |
| `discharge_latest_m3s` | `river_discharge` for the current UTC day, else the latest row |
| `discharge_baseline_m3s` | mean `river_discharge` over the past, completed days (`date < today`) |
| `discharge_observed_peak_m3s` | max `river_discharge` over those past, completed days |
| `discharge_forecast_peak_m3s` | max `river_discharge` from today onwards |
| `discharge_climatology_mean_m3s` | mean of the API's `river_discharge_mean` |
| `discharge_observed_days` | count of past days backing the baseline |

Field names containing `observed` predate the provenance clarification. In
every case "observed" means **"before today"**, i.e. the past-model part of the
series. It does **not** mean a gauge or radar measurement; see §5.1.

Window semantics: an Open-Meteo hourly value at time T is the accumulation over
the hour *beginning* at T, so **all three windows are half-open** —
lower-inclusive, upper-exclusive. This makes each window exact for any phase of
`now` within the hour, and it means a window of 72 h holds exactly 72 hourly
samples. Pinned by `test_antecedent_total_includes_the_last_24_hours`,
`test_forecast_window_holds_exactly_72_hours`,
`test_forecast_window_excludes_the_72_hour_boundary_sample` and
`test_all_rainfall_windows_are_half_open_and_72_samples_wide`.

`None` always means "not available", never zero. A **numeric** `0.0` is real
data and is reported as such: `max_or_none(forecast) or max_or_none(current)`
used to discard a legitimate forecast peak of `0.0`, because `0.0` is falsy, and
publish today's discharge in its place. Pinned by
`test_zero_forecast_discharge_peak_is_not_treated_as_missing` and
`test_forecast_peak_still_falls_back_to_today_when_no_forecast_rows_exist`.

**Stage 4 — Flood risk assessment** → see §8.

**Stage 5 — Threat classification** → see §9.

**Stage 6 — Alert decision** → see §10.

**Stage 7 — Structured output** → see §11.

---

## 8. Risk Assessment Method

### 8.1 What this is, stated plainly

**The flood risk engine is a rule-based, deterministic, transparent composite
index. It is NOT a machine-learning model.**

- Nothing is trained, fitted or learned.
- No dataset with verified Nepal flood outcomes was available at this milestone.
- There are therefore **no** accuracy, precision, recall, F1, ROC, AUC, log-loss
  or validation figures for it, because none were measured.
- `risk/config.py` sets `IS_MACHINE_LEARNING = False`, and every output carries
  `"is_machine_learning": false` plus the string
  `"PROTOTYPE ASSUMPTIONS - not Nepal-calibrated, not derived from official
  warning thresholds, not validated against observed flood outcomes."`

It is **not** statistical inference either: it computes no distribution, no
confidence interval and no p-value. It is a documented weighted sum with
published assumptions. Calling it anything more would be inaccurate.

### 8.2 The formula

Four indicators, each min-max normalised into `[0, 1]` and clamped:

| Indicator | Source feature | Normalisation | Weight |
| --- | --- | --- | --- |
| `antecedent_rainfall` | `rainfall_past_72h_mm` | `(v − 20) / (120 − 20)` | **0.30** |
| `forecast_rainfall` | `rainfall_forecast_72h_mm` | `(v − 20) / (120 − 20)` | **0.15** |
| `discharge_level` | `discharge_latest_m3s` | `(v − 30) / (400 − 30)` | **0.35** |
| `discharge_rise` | `latest / baseline` | `(r − 1) / (4 − 1)` | **0.20** |

Weights sum to exactly 1.00 (enforced by `validate_config()` at the start of
every pipeline run).

Aggregation with graceful degradation:

```
available_weight = Σ weight of indicators that could be computed
coverage         = available_weight / 1.00
risk_score       = Σ (weight_i × normalised_i) / available_weight
```

If `available_weight == 0`, `risk_score` is `None` and the threat level becomes
`UNKNOWN`. A partial score is **renormalised over what exists** and is always
published with its `coverage`, so a score computed from 45% of the indicators
can never be mistaken for a complete one.

### 8.3 Why these weights (documented judgement, not fitted)

- **Discharge state dominates (0.35 + 0.20 = 0.55).** River discharge is the
  variable closest to the hazard itself; rainfall is a proxy for it.
- **Antecedent rainfall outranks forecast rainfall (0.30 vs 0.15).** River
  response lags rainfall, so recent past rainfall is the stronger predictor,
  and forecast error grows with lead time.
- **Discharge rise is a separate term from discharge level** because a river can
  be low in absolute terms while rising steeply, which is the actual onset of
  flooding.

### 8.4 A design decision worth flagging

The original prototype normalised current discharge against the *forecast's own*
mean and max, so the component depended on the shape of the forecast rather than
on the river's actual state — a flat forecast drove the component to 0. This was
replaced with **absolute** prototype bands. This was a deliberate change, not an
accident, and it is regression-tested by
`test_discharge_level_uses_absolute_bands_not_self_referential_ones`.

### 8.5 Threshold status — read this before quoting any number

Every threshold in `risk/config.py` is a **PROTOTYPE ASSUMPTION**. They are
**not**:

- official Nepal disaster-warning thresholds,
- thresholds from NDRRMA, DHM or any other authority,
- calibrated against Nepali river-gauge records,
- validated against any observed flood outcome.

The rainfall bands (20 mm / 120 mm over 72 h) are round numbers chosen for
legibility. The discharge bands (30 / 400 m³/s) are order-of-magnitude bands
chosen to span the range this API returns. The rise band (1× / 4×) encodes the
general observation that a rising limb matters more than the absolute ratio.
None of them were fitted to data. `GET /v1/thresholds` publishes all of them
with the calibration status attached.

---

## 9. Threat-Level Logic

Centralised in `risk/config.py` (`THREAT_BANDS`), applied by
`risk/threat.py:classify_threat`. Bands tile `[0, 1]` contiguously; each is
lower-inclusive and upper-exclusive; `1.0` is `CRITICAL`.

| Threat level | Risk score | Meaning |
| --- | --- | --- |
| `LOW` | `[0.00, 0.25)` | Normal conditions for the analysed location. |
| `MODERATE` | `[0.25, 0.50)` | Elevated conditions; worth monitoring. |
| `HIGH` | `[0.50, 0.75)` | High hazard indication; alerting enabled. |
| `CRITICAL` | `[0.75, 1.00]` | Very high hazard indication; alerting enabled. |
| `UNKNOWN` | no score | **Not a canonical level.** Emitted only when `risk_score is None`, so "no data" is never displayed as "no risk". |

The cut points 0.25 / 0.50 / 0.75 divide the range into equal quarters. They are
**not** derived from impact or loss data.

`classify_threat` raises `ValueError` for a score outside `[0, 1]`, and for a
non-numeric score including `NaN` and `bool`.

**This tiling is enforced, not just asserted.** `THREAT_BANDS` stores only
`min_score`, and each band's upper bound is derived from the *next* band's
`min_score` (the last one closes at `1.0`). Checking that boundaries strictly
increase is therefore *not* enough: a final band pinned to `1.0` still
increases monotonically and still starts at `0.0`, but at runtime it leaves
`[0.50, 1.00)` reporting `HIGH` and makes `CRITICAL` reachable only at the single
point `1.0` — silently contradicting the `[0.75, 1.00]` row above.
`validate_config()` now rejects that via `threat_band_gaps()`, which flags any
band whose implied range is empty or whose own midpoint does not classify as
itself. Pinned by
`test_validate_config_rejects_a_degenerate_final_threat_band`,
`test_shipped_threat_bands_tile_the_unit_interval_without_gaps`,
`test_every_shipped_band_owns_the_range_it_documents` and
`test_published_band_bounds_are_contiguous_and_end_at_one`.

`/v1/thresholds` now publishes the resolved bounds
(`min_risk_score`, `max_risk_score`, `max_inclusive`) so the table above is
machine-checkable rather than implied.

---

## 10. Alert Logic

Alerting is a **separate stage** in `risk/alert.py`. It answers "should anyone be
told?", not "how severe is this?".

An alert is published only when **both** conditions hold:

1. `threat_level ∈ {HIGH, CRITICAL}`, **and**
2. `coverage ≥ ALERT_POLICY.min_coverage_to_alert`, currently **1.0**.

| Threat level | Coverage | Result |
| --- | --- | --- |
| `LOW` | any | no alert, `recommendation="none"` |
| `MODERATE` | any | no alert, `recommendation="monitor"` |
| `UNKNOWN` | any | no alert, `recommendation="acquire_data"` |
| `HIGH` / `CRITICAL` | `= 1.0` | **`alert = true`**, `recommendation="dispatch_relief_network"` |
| `HIGH` / `CRITICAL` | `< 1.0` | no alert, **`suppressed = true`**, `requires_manual_verification = true`, `recommendation="verify_before_alerting"` |

**Rationale for `min_coverage_to_alert = 1.0`:** the rainfall-only path is the
least defensible part of this prototype — turning rainfall into a flood warning
without a calibrated rainfall–flood relationship is exactly the step that needs
real data. So a partial-data result is escalated for human verification instead
of being published as a warning. This is a deliberate fail-safe, and it is
configurable for a future milestone.

`alert_required(level)` is retained from the original prototype as a level-only
helper. It ignores data quality, so operational code should call `decide_alert`.

---

## 11. Output / Integration Contract

Produced by `schemas/events.py` as `IntelligenceEvent`, contract version
**`1.0.0`**. The identical object is emitted by the CLI and the HTTP API.

The example below is a **real captured run** (Kathmandu, 2026-09-26, live
Open-Meteo), abridged only where marked `/* … */`:

```jsonc
{
  "contract_version": "1.0.0",
  "event_id": "flood-20260926T161818Z-e0c612",   // "<type>-<UTCstamp>-<6 hex>"
  "disaster_type": "flood",
  "location": {
    "name": "Kathmandu",
    "latitude": 27.7172, "longitude": 85.324,
    "country": "Nepal",
    "grid_point": true                          // request was snapped to a model cell
  },
  "risk_score": 0.514,                          // 0..1, or null if nothing was assessable
  "assessment": {
    "threat_level": "HIGH",
    "alert": true,
    "reason": "Threat level HIGH is at or above the alerting threshold with full indicator coverage (100%).",
    "requires_manual_verification": false,
    "suppressed": false,
    "recommendation": "dispatch_relief_network",
    "missing_indicators": []
  },
  "data_quality": {
    "coverage": 1.0,
    "indicators_used": ["antecedent_rainfall", "..."],
    "indicators_missing": [],
    "origin": "live_api",                       // live_api | synthetic_demo | partial | none
    "is_synthetic": false,
    "sources": [
      {"name": "open-meteo-weather", "status": "ok", "origin": "live_api", "detail": null, "records": 336},
      {"name": "open-meteo-flood-glofas", "status": "ok", "origin": "live_api", "detail": null, "records": 10}
    ],    "warnings": []
  },
  "message": "Flood threat HIGH for Kathmandu (...). ...",
  "evidence": {
    "method": "FLARE Flood Risk Engine",
    "method_version": "0.2.0-prototype",
    "method_type": "rule_based_deterministic_composite_index",
    "calibration_status": "PROTOTYPE ASSUMPTIONS - not Nepal-calibrated, not derived from official warning thresholds, not validated against observed flood outcomes.",
    "is_machine_learning": false,
    "coverage": 1.0,
    "indicators": [ /* per-indicator raw value, normalised, weight, contribution, note */ ],
    "thresholds": { /* every band used, echoed back */ },
    "measurements": { /* every raw feature value, incl. discharge_latest_is_forecast */ },
    "threat_level": "HIGH",
    "model_grid": {
      "weather": { "latitude": 27.732864, "longitude": 85.34831, "elevation": 1301.0 },
      "flood":   { "latitude": 27.725006, "longitude": 85.32501, "elevation": 1301.0 },
      "note": "Open-Meteo snaps each request to its nearest model grid cell, ..."
    },
    "warnings": [], "notes": []
  },
  "timestamp": "2026-09-26T16:18:18.671584Z",
  "observation_timestamp": null
}
```

### On `confidence`

**There is deliberately no `confidence` field.** There is no trained model, no
calibrated probability and no validated outcome data at this milestone, so any
confidence number would be invented. Instead the contract carries
`data_quality`, which reports *observable facts about the inputs* — which
indicators were used, what fraction of the intended weight that is, whether the
data was live or synthetic, and every processing warning. That is a fact about
the data, not a prediction about the future, and it cannot be mistaken for a
probability.

Enforced by `test_contract_has_no_confidence_or_probability_field`, which walks
the generated JSON Schema and asserts no property is named `confidence`,
`probability` or `likelihood`. (The word "confidence" does appear once in the
schema, inside the `data_quality` *description* — "Observable facts about the
inputs. Not a confidence score." — which is the disclaimer, not a field.)

### HTTP endpoints (`api.py`)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | liveness; no network |
| GET | `/v1/thresholds` | every threshold, weight and band + calibration status |
| GET | `/v1/locations` | assessable demo locations |
| GET | `/v1/scenarios` | synthetic scenarios, labelled non-live |
| GET | `/v1/flood?location=&fallback_synthetic=` | **live** assessment |
| GET | `/v1/flood/offline?location=&scenario=` | synthetic assessment, no network |
| GET | `/v1/contract` | JSON Schema of the output contract |
| GET | `/demo/earthquake` | original prototype earthquake path |

**A failing upstream source is not an HTTP error.** The pipeline records it and
returns a normal assessment whose `data_quality.sources` shows the failure and
whose `assessment.reason` explains the consequence. A 502 would tell the relief
network nothing about whether there is a flood. Only genuinely unusable
*requests* return 4xx (unknown location, unknown scenario); a 503 is returned
only when a live call fails **and** `fallback_synthetic=false`.

**Coupling:** this layer has no import, no shared state and no knowledge of the
Relief Network team's frontend or backend.

---

## 12. Tests

### 12.1 How the two suites are separated

| Suite | Command | Network |
| --- | --- | --- |
| **UNIT / hermetic** | `python -m pytest` | **none** — transport is faked |
| **LIVE API integration** | `$env:FLARE_LIVE_TESTS="1"; python -m pytest tests/test_live_api.py` | **yes** — real HTTPS |

The live suite is skipped by default and is marked `live` in `pytest.ini`. A
failure in it means "could not verify", never "the pipeline is broken".

### 12.2 Results actually observed on 2026-09-27

```
UNIT:  474 passed, 12 skipped   (~2.1s)    — the 12 skips are the live tests
LIVE:  12 passed                (18s)       — real calls, all green
```

486 collected. The live wall-clock varies between roughly 12 s and 28 s across
runs because it depends on two third-party services; the unit suite is hermetic
and stable. The 54 Milestone 2 tests and the 87 Milestone 2B parser tests added
0.8 s and opened no sockets.

Environment: Windows, Python 3.14.7, pytest 9.1.1, requests 2.34.2,
pydantic 2.13.5, fastapi 0.141.1.

### 12.3 What each area of testing actually verified

| **Test area** | Count | What was actually verified |
| --- | --- | --- |
| **Free-text parser** (`test_parser.py`) | 87 | See §19. |
| **Agent tool contract** (`test_agent.py`) | 54 | A valid flood request returns an assessment; arbitrary coordinates work, including one far outside Nepal; the `Location.name` label is the coordinate, not a geocoded place; a missing, blank or whitespace disaster type asks for one; the type matches case-insensitively; a missing location asks for one; half a coordinate is treated as missing, with the `detail` naming the absent half; 7 impossible coordinates (out of range both ways, `NaN`, `inf`) are refused rather than forwarded; coordinate bounds are proven to come from `Location`, not a second copy; `flood` is the only supported type; 5 unsupported types (including `earthquake`) are refused rather than routed to flood; **the earthquake result is proven *not* contract-compatible**; a successful response is a real `IntelligenceEvent` with **every** Milestone 1 field present — location, risk score, threat level, alert, coverage, provenance, sources, warnings, evidence, timestamps, and the prototype disclaimer; offline results are labelled synthetic and never claim to be live; an unknown scenario is refused; the `live` branch is covered by replacing the entry point with a recorder, without a socket; the agent asks instead of guessing, answers readably, states provenance, refuses an unsupported disaster in plain language, and surfaces the tool's follow-up question verbatim; **the status vocabulary is a closed `Literal`**; and four AST-read scope guards: no import of `risk.flood` / `risk.alert` / `risk.threat` / `processing.flood_features`, no LLM dependency, no network transport, no `DEMO_LOCATIONS` dependency, and no second `IntelligenceEvent` schema. Plus the four `python -m agent` demonstration behaviours. |
| **Threat classification** (`test_threat.py`) | 25 | Exact band boundaries at 0.0 / 0.2499 / 0.25 / 0.4999 / 0.50 / 0.7499 / 0.75 / 1.0; all four canonical levels produced by scanning all 101 sampled scores; `None` → `UNKNOWN` and `UNKNOWN` proven *not* a member of `THREAT_LEVELS`; `ValueError` for out-of-range (−0.0001, 1.0001, −1.0, 2.0), string, `bool`, object and `NaN` scores; integers accepted; bands tile `[0,1]` with no gaps. |
| **Alert decision** (`test_alert.py`) | 70 | HIGH and CRITICAL at full coverage → alert; LOW and MODERATE → never; MODERATE → `monitor`, LOW → `none`; **a qualifying threat on partial coverage is suppressed and flagged for manual verification**; coverage exactly at the policy minimum still alerts; `UNKNOWN` never alerts and asks for data; `alert_required` shown to ignore coverage but reject `UNKNOWN`; the decision object is immutable; it serialises to the contract shape; the policy is injectable for future calibration. **Non-finite and out-of-range coverage is rejected inside `decide_alert()`**: `NaN`, `+inf` and `−inf` are rejected for both HIGH and CRITICAL, values above `1.0` and below `0.0` are rejected, `None` / non-numeric values are rejected instead of raising, `bool` is refused even though `True == 1`, and a rejected value is recorded as a JSON-safe string; numeric strings such as `"1.0"` are still accepted; every rejected value yields `alert=False` + `suppressed=True` + `requires_manual_verification=True`, and the decision still serialises under `json.dumps(..., allow_nan=False)`. |
| **Risk arithmetic** (`test_flood_risk.py`) | 31 | Normalisation clamps at both ends (5 cases) and handles a degenerate band; all-zero features → exactly `0.0`; all-saturated → exactly `1.0`; score stays in `[0,1]` across a **16-point** rainfall × discharge sweep; a **hand-computed** mixed event → `0.470`; per-indicator contributions sum to the score; effective weights sum to 1 at full coverage; indicators clamp below the low band; forecast rainfall carries the lowest weight; discharge level uses absolute bands; rise is 0 at or below baseline, saturates at 4×, is ignored for a near-zero baseline, and contributes nothing at the neutral ratio; no indicator at all → no score; weights renormalise over available indicators; partial data can still reach a qualifying threat; negative rainfall and discharge are **rejected, not clamped**; a missing baseline disables only the rise indicator; short discharge history is flagged and full history is not; evidence declares the method is not ML and publishes every threshold; the engine is deterministic. Renormalisation is concrete, not theoretical: a rainfall-only run reports `coverage = 0.45` and `risk_score = 0.667` from `(0.30×1.0 + 0.15×0.0) / 0.45`. |
| **Invalid data handling** (`test_processing.py`) | 66 | `coerce_float` **accepts** 6 readable forms and **rejects** 15 unreadable ones (`None`, empty and whitespace strings, `"abc"`, `"nan"`, `"inf"`, `"-inf"`, `True`, `False`, list, dict, tuple, object); float lists preserve positions and count drops; a non-list is handled; `truncate_to_shortest` keeps series aligned; timestamps parse in 3 formats and reject 5 kinds of junk; aggregate helpers ignore `None` and return `None` when nothing is usable; rainfall windows are measured against the injected clock and forecast rainfall is kept separate from past rainfall; **the last 24 h are included** (regression test for the off-by-one); **the forecast window holds exactly 72 hourly samples** and **excludes a sample landing on `now + 72h`**, with all three rainfall windows asserted half-open and 72/24/72 samples wide; **a forecast discharge peak of `0.0` is reported as `0.0` and not replaced by today's value**, while a genuinely absent forecast still falls back to today; missing hourly block and missing precipitation series are reported, not fatal; a series shorter than its own time axis is truncated with a warning; unparsable values become `None` and are counted; unparsable timestamps are skipped with a warning; discharge is split into past / today / forecast; the climatology mean is read from its own field; **the latest row is the most recent row that actually carries a value, so a `None` today-row no longer overrides an older usable reading and a malformed timestamp can never win the selection**; **a usable today-row is still preferred over a later missing forecast row**; **a payload with no usable value at all reports no latest reading**; **a `0.0` today-row is a real measurement and is never discarded or treated as missing**; **null discharge rows stay `None`, never 0**; **an absent optional series does not destroy the required one** (regression test); a misaligned optional series is padded, not truncated; missing daily block reported; unparsable discharge timestamps yield nothing; the full-history threshold is exposed; no inputs at all is handled; empty dicts count as unavailable; grid metadata is captured and null-safe; evidence is JSON-friendly; discarded values accumulate across both sources. |
| **Collector error handling** (`test_collectors.py`) | 23 | A decoded object is returned; timeout, `ConnectionError` and **DNS failure** each classified; HTTP 400 → `invalid_request` carrying the upstream `reason`; 4xx **not** retried; HTTP 503 **is** retried then raised (regression test); non-JSON body → `malformed_json`; a JSON array → `unexpected_payload`; an error serialises for the output contract; zero retry attempts is a programming error; a transient failure then success recovers; the weather and flood requests use the documented parameters; out-of-range latitude and longitude are rejected **before any request is sent** (6 cases); the collectors hit the documented endpoints and pass the session through; **the session-level network guard blocks an outbound connection and allows loopback**, which is what keeps the default suite hermetic. |
| **Configuration** (`test_config.py`) | 28 | The shipped config is valid; weights sum to 1.0; indicator keys are unique; every indicator declares a unit and a label; the method self-declares rule-based / not ML; the calibration status text denies validation and official thresholds; threat bands start at zero and increase; `UNKNOWN` is distinct from the canonical levels; the alert policy matches the documented fail-safe; `validate_config()` rejects bad weights, duplicate keys, inverted rainfall / discharge / rise bands, non-increasing bands, a missing threat level, **a degenerate final band that leaves a gap**, **and an internal gap where the boundaries do not form an even partition of `[0, 1]`**; the shipped bands are proven gap-free and each band is proven to own the range it documents; the published bounds are contiguous and end at 1.0; **the even-partition rule is proven generic rather than hard-coded to quarters, using a six-band partition**; the internal band-lookup mirror is proven to agree with `classify_threat` across 1001 sampled scores; the shipped band values are ordered; `describe_thresholds()` is complete, serialisable and **matches the live constants**. |
| **Output contract** (`test_schemas.py`) | 24 | A minimal event validates; every required output field is present; threat level and alert are separate fields; `risk_score` may be null but not out of range; a blank message is rejected; **naive timestamps are rejected**; `observation_timestamp` may be absent; location defaults to Nepal and rejects impossible coordinates (4 cases); **the location contract accepts any coordinate, not only the demo places, and its field set is pinned**; `origin` is a closed set; coverage is bounded; the synthetic flag defaults to false and is never derived; source status can record failures; the origin type is exported; **no `confidence` / `probability` / `likelihood` property anywhere in the schema**; the contract exposes observable data-quality facts instead; `to_dict()` is JSON-ready with ISO timestamps; the event-id format is enforced, ids are unique across calls, and the timestamp inside an id is stable. |
| **Pipeline** (`test_pipeline.py`) | 24 | A full run produces a valid contract object; all three stages are present and separate; sources are recorded with record counts; the message always carries the disclaimer; output is JSON-serialisable; event-id shape and uniqueness; the timestamp uses the injected clock; **no `confidence` field**; weather failure → `partial` without raising; flood failure → `partial`; **partial data suppresses a qualifying alert**; **both sources failing → `UNKNOWN`, no alert**; a collector *bug* is contained; one empty payload → `partial`; both payloads empty → no usable data; synthetic origin is propagated and warned about; **per-source origin can never contradict the run provenance** (regression test); a caller can flag degradation explicitly; evidence carries measurements, method and thresholds and lists every indicator with its contribution; **`location.grid_point` is true when *either* grid source is present** (weather-only, flood-only and both), and false only when neither is. |
| **Live→synthetic fallback** (`test_fallback.py`) | 11 | Total source failure and "sources answered but yielded no indicator" are both detected as unusable; a healthy live run and a **partial** live run are both treated as usable, so real degraded data is never discarded in favour of a synthetic scenario; the failure summary names every source with its reason and detail; the fallback fires on total failure, warns on stderr, and returns a result labelled `synthetic_demo` at run *and* source level; the fallback is skipped for healthy and partial results; the API returns **503** with the source summary when live data is unusable and fallback is disabled; the API does **not** 503 on partial data; the API's fallback path returns a properly labelled synthetic result. |
| **HTTP API** (`test_api.py`) | 18 | `/health` needs no network; `/v1/thresholds` publishes every assumption; `/v1/contract` returns a JSON Schema; `/v1/locations` lists the demo locations; `/v1/scenarios` warns they are not live; the three documented scenario outcomes match exactly (`calm`→LOW, `rising`→MODERATE, `severe`→CRITICAL+alert); the partial-data scenario is suppressed, not alerted; the malformed scenario still returns a contract object; the offline endpoint never claims live data; unknown location and unknown scenario are 404s listing the valid options; the flood response carries no `confidence` field and is JSON-serialisable end to end; **the earthquake endpoint is exercised against a mocked collector, including the magnitude filter and an empty feed, so no default test touches the network**. |
| **Synthetic scenarios** (`test_demo_fixtures.py`) | 13 | The scenario file carries a prominent synthetic warning; every scenario has a description and an expected outcome; all are listed and an unknown name raises; materialised payloads have the real API shape; the time axis is anchored to `now`; materialisation is deterministic for a fixed clock; the three documented outcomes match; the no-discharge scenario demonstrates the fail-safe; the malformed scenario still produces a result with warnings; **every offline result is labelled synthetic**. |
| **LIVE API** (`test_live_api.py`) | 12 | See §12.4. |

### 12.4 Live API tests — what was actually verified

All 12 passed against the real endpoints on 2026-09-26.

| Live test | What it actually proved |
| --- | --- |
| `test_weather_endpoint_is_reachable_and_shaped_as_expected` | HTTP 200; `hourly` and `daily` blocks present; **exactly 336 hourly steps** for `past_days=7, forecast_days=7`; `utc_offset_seconds == 0`. |
| `test_flood_endpoint_is_reachable_and_shaped_as_expected` | HTTP 200; all three requested discharge fields present; **exactly 10 daily steps**; series length equals the time-axis length. |
| `test_flood_api_does_not_offer_hourly_discharge` | `hourly=river_discharge` genuinely returns **HTTP 400**, classified as `invalid_request`. Documents the upstream limitation instead of working around it. |
| `test_invalid_coordinate_is_rejected_by_the_upstream_api` | Latitude 999 produces a real HTTP 400 whose `reason` mentions the −90..90 range — i.e. the error-detail path works against the real service. |
| `test_unreachable_host_is_classified_as_a_network_failure` | A reserved-for-documentation `.invalid` host is classified as `network_unreachable` (or `timeout`), never as success. |
| `test_pipeline_completes_against_live_data` | The whole pipeline completes on real data; score in `[0,1]`; **never claims to be synthetic**. |
| `test_live_run_produces_real_measurements` | A clean `live_api` run at 100% coverage, with a real `discharge_observed_days` and `discharge_baseline_m3s`. |
| `test_live_run_reports_the_model_grid_offset` | The returned grid coordinates genuinely differ from the requested point, i.e. the disclosure in `model_grid` is real and not decorative. |
| `test_pipeline_works_at_a_second_nepal_location` | The pipeline is not tuned to one coordinate (Biratnagar also returns `live_api`). |
| `test_method_metadata_declares_the_prototype_status_in_live_output` | The prototype disclaimer and `is_machine_learning: false` survive into live output. |
| `test_usgs_earthquake_feed_is_live` | The USGS GeoJSON feed genuinely answers, so the real earthquake path still has coverage after the default test was mocked. |
| `test_earthquake_assessment_completes_against_live_events` | The assessment runs end to end on the real feed, including the significant-event filter and the degenerate "no significant events" case. |

### 12.5 Observed end-to-end results

Synthetic scenarios (`python main.py --offline --scenario <name>`):

| Scenario | risk | threat | alert | suppressed | coverage |
| --- | --- | --- | --- | --- | --- |
| `calm` | 0.004 | LOW | false | false | 1.00 |
| `rising` | 0.381 | MODERATE | false | false | 1.00 |
| `severe` | 0.913 | CRITICAL | **true** | false | 1.00 |
| `no_discharge_data` | 0.667 | HIGH | false | **true** | 0.45 |
| `malformed` | 0.207 | LOW | false | false | 0.85 |

Live runs measured 2026-09-26 19:17 UTC — these are real results from the live
APIs, and they will differ when you run them, because the weather and the
rivers change. They are still model output on a grid, not instrument readings:

| Location | risk | threat | alert | coverage | origin |
| --- | --- | --- | --- | --- | --- |
| Kathmandu | 0.459 | MODERATE | false | 1.00 | live_api |
| Biratnagar | 0.216 | LOW | false | 1.00 | live_api |
| Pokhara | 0.441 | MODERATE | false | 1.00 | live_api |
| Butwal | 0.678 | HIGH | **true** | 1.00 | live_api |
| Birgunj | 0.503 | HIGH | **true** | 1.00 | live_api |

These values were re-measured after the forecast-window fix described in §6, so
they are not directly comparable with any run recorded before it.

The `severe` scenario score of `0.913` was predicted by hand from the published
formula *before* the code was run, and the code reproduced it exactly. That is
the strongest evidence available at this milestone that the engine is genuinely
transparent rather than accidentally correct.

---

## 13. Known Issues

Bugs found and **fixed** during this milestone, each now covered by a regression
test:

1. **Optional series destroyed required data.** An absent
   `river_discharge_max` was passed into `truncate_to_shortest` as an empty
   list, so the minimum length became 0 and *all* discharge data was truncated
   away. The `no_discharge_data`-style degradation silently produced no
   discharge features at all. Fixed by fitting optional series to the required
   series' length. Regression test:
   `test_absent_optional_series_does_not_destroy_the_required_one`.
2. **5xx errors were not retried.** `fetch_json` marked every HTTP error as
   final, so a transient 503 was raised immediately despite the comment
   promising a retry. Fixed; 4xx still short-circuits. Regression test:
   `test_server_error_is_retried_then_raised`.
3. **An empty payload was recorded as a successful collection.** A collector
   returning `{}` was stamped `status="ok"`, so a total data loss looked like
   success at the API boundary. Fixed with an `empty_payload` status. Regression
   test: `test_both_payloads_empty_yields_no_usable_data`.
4. **Rainfall windows were off by one hour.** The windows used `(now−24h, now]`,
   which excluded the sample at exactly `now−24h` and so reported 23 hours where
   24 were intended. Corrected to `[now−24h, now)`, which is also the
   hydrologically correct reading of an Open-Meteo hourly accumulation.
   Regression test: `test_antecedent_total_includes_the_last_24_hours`.
5. **Per-source provenance could contradict the run.** In offline mode each
   source was stamped `origin="live_api"` while the run said
   `synthetic_demo`. Fixed by threading the run origin into the source record.
   Regression test:
   `test_per_source_origin_never_contradicts_the_run_provenance`.
6. **A malformed synthetic value crashed the fixture builder.** A string in the
   `malformed` scenario broke the `precipitation_probability` derivation. Fixed
   with `coerce_float`.
7. **The live→synthetic fallback could never fire, and neither could the API's
   503.** `run_flood_with_fallback` wrapped the live call in
   `except DataSourceError`, and `api.py` used the same pattern to return 503 when
   `fallback_synthetic=false`. But `run_flood_pipeline` *records* a classified
   source failure and keeps going by design — a behaviour pinned by
   `test_weather_failure_degrades_to_partial_without_raising` — so the exception
   never arrives. Both branches were dead code: with the network down,
   `--fallback-synthetic` silently returned a degraded `UNKNOWN` result instead
   of the synthetic scenario, and `fallback_synthetic=false` returned **200** with
   no data instead of 503. Fixed by deciding from the returned
   result via `main.live_collection_is_unusable`, which treats a total source
   failure *or* an indicator-less result as unusable, and deliberately treats a
   **partial** live result as usable so real degraded data is not thrown away for
   synthetic data. Regression tests: all 11 in `tests/test_fallback.py`.

Bugs found by the **independent audit** and fixed in the audit-response pass,
each with a regression test that was confirmed to fail against the pre-fix code:

8. **Non-finite coverage could publish a high-severity alert.**
   `decide_alert("CRITICAL", coverage=float("nan"))` returned `alert=True`,
   because `nan < 1.0` is `False`, so the partial-coverage guard fell through;
   values above `1.0` passed for the same reason. `None` and non-numeric values
   raised instead of being handled. Fixed by validating coverage to a finite
   fraction in `[0, 1]` inside `decide_alert()`, so a rejected value yields
   `alert=False` + `suppressed=True` + `requires_manual_verification=True`.
   Regression tests: 56 added to `tests/test_alert.py`.
9. **The default test suite was not hermetic.**
   `test_earthquake_endpoint_is_still_available` called `/demo/earthquake`, which
   performs a real USGS request, so the suite depended on a third party being
   up. The collector is now mocked in `tests/test_api.py`, the real coverage
   moved to two opt-in live tests, and `tests/conftest.py` installs a
   session-level guard that blocks any non-loopback socket for non-live tests.
10. **The forecast rainfall window was 73 hours wide.** The bound was inclusive
    at both ends (`now <= moment <= now + 72h`), so with hourly samples the
    window collected 73 values while every document described 72. Measured
    directly: 1 mm/h for 96 h produced `rainfall_forecast_72h_mm = 73.0` while
    the past windows correctly produced 24 and 72. All three windows are now
    half-open, `[now, now + 72h)`. Regression tests: 4 in
    `tests/test_processing.py`.
11. **A forecast discharge peak of `0.0` was treated as missing.**
    `max_or_none(forecast) or max_or_none(current)` discarded a legitimate zero
    because `0.0` is falsy, and published today's discharge in its place. Fixed
    by testing for `None` explicitly. Regression tests: 2 in
    `tests/test_processing.py`.
12. **Threat bands were not verified to tile `[0, 1]`.** `validate_config()`
    checked only that boundaries strictly increase and that the first band
    starts at `0.0`, while its own docstring claimed to check contiguity. Since
    each band's upper bound is *derived* from the next band's `min_score`, a
    final band pinned to `1.0` passes both checks but leaves `[0.50, 1.00)`
    reporting `HIGH` and makes `CRITICAL` reachable only at the single point
    `1.0`, silently contradicting the documented `[0.75, 1.00]`. Fixed with
    `threat_band_gaps()`, which flags any band whose implied range is empty,
    whose width differs from the others, or whose own midpoint does not
    classify as itself. Because every upper bound is derived from the next
    band, no score is ever unclassified, so an uneven width is the only way an
    internal gap can hide: boundaries such as `0.00 / 0.25 / 0.60 / 0.75`
    (widths `0.25 / 0.35 / 0.15 / 0.25`) passed the ordering check and
    contradicted the published equal-quarter table. The rule is "every band is
    the same width", not "the width is 0.25", so it is not welded to the shipped
    table. Regression tests: 9 in `tests/test_config.py`.
13. **`location.grid_point` under-reported gridded data.** The flag was derived
    from the flood grid alone, so a weather-only run reported `grid_point=False`
    while `evidence.model_grid.weather` was populated. Now true when *either*
    grid source is present. Regression tests: 4 in `tests/test_pipeline.py`.
14. **Model output was described as "observed" data.** `past_days` values are
    the model's hindcast for elapsed hours, not station or radar readings, but
    the docs, the collector docstrings, two indicator labels and the human-readable
    event message all called them observed. Corrected throughout; the
    `discharge_observed_*` *field names* are unchanged (renaming them would break
    the contract) and are documented as meaning "before today". See §5.1.

Audit findings that were investigated and deliberately left unchanged:

15. **`requirements.txt` lists `httpx2`, not `httpx` — this is correct, and the
    audit's claim is outdated.** The installed `starlette/testclient.py` does
    `import httpx2 as httpx` itself, and its own error message reads *"The
    starlette.testclient module requires the httpx2 package to be installed"*,
    treating plain `httpx` as the deprecated fallback. `import httpx` genuinely
    fails in this environment while all 18 API tests pass, which is exactly the
    `httpx2` path. No change made.
16. **The location contract already supports arbitrary coordinates — no schema
    change is needed.** The audit asked for a decision on this before exposing
    the pipeline as an agent tool. `Location` is coordinate-based with no
    whitelist: an arbitrary non-Nepal point (`12.3456, -45.6789`) runs end to end
    and returns a valid `live_api` event. The key-based lookup in
    `GET /v1/flood` is a demo convenience over `DEMO_LOCATIONS`, not a contract
    restriction. The decision is now pinned by
    `test_location_accepts_any_coordinate_not_only_the_demo_places`. Adding
    `place_name` / `area_description` stays deferred to a deliberately versioned
    future contract change, as the audit itself recommends.

Open issues, **not** fixed:

17. **An unknown offline scenario produces a Python traceback.**
    `python main.py --offline --scenario nope` raises
    `demo.fixtures.ScenarioNotFound` through to the interpreter, printing a stack
    trace and exiting `1`. The exception message itself is already good
    (*"unknown scenario 'nope'; available: calm, ..."*); only the presentation is
    wrong. The HTTP API handles the same case correctly with a 404. This is
    audit Issue 8, which the audit did **not** include in its "required fixes
    before the agentic layer" list, so it was left alone in this pass. It is a
    small, contained fix and is the obvious next CLI improvement.
18. **The 24 h and 72 h rainfall windows are not cross-validated.** Daily
    `precipitation_sum` is requested from the API but is not compared against the
    hourly-derived totals. A disagreement would currently go unnoticed.
19. **No caching or rate limiting.** Each pipeline run makes two HTTPS requests.
    Acceptable at this scale, but a monitoring loop would need both.
20. **Earthquake output does not conform to the new contract.** Verified live:
    `GET /demo/earthquake` returns the original ad-hoc dict
    (`disaster_type`, `location`, `scope_note`, `risk_score`, `threat_level`,
    `alert`, `evidence`) with no `contract_version`, `event_id`, `assessment` or
    `data_quality`. It is retained unchanged in scope and clearly marked with a
    `scope_note`; harmonising it is future work.
21. **Rainfall and discharge are read at the same coordinate but are not
    catchment-aligned.** Rain falling on the grid cell above Kathmandu and
    discharge in the reach next to Kathmandu are only loosely related. For a real
    basin model, discharge would be read per hydrological sub-basin.
22. **The per-source `status` vocabulary is not centrally defined.**
    `DataSourceStatus.status` is a plain `str`, so the set of legal values lives
    in two places: the six members of `FailureReason` in `collectors/base.py`,
    plus `empty_payload` and `unexpected_error` emitted by `pipeline.py`. A typo
    in either place would pass validation unnoticed. The `origin` field, by
    contrast, *is* a closed `Literal`, and is tested as such.
23. **A missing or unparsable discharge row could win latest-row selection.**
    The reported `discharge_latest_m3s` was taken as `current[-1]`, i.e. the last
    row stamped for the current day, with no check that it carried a value. A
    `None` in today's row therefore published "no latest reading" even when real
    measurements sat in the same payload, and the fallback scan walked the raw
    `time`/value lists without parsing timestamps, so a trailing garbage stamp
    carrying a large number could be reported as the latest discharge. Selection
    is now made from the rows whose timestamp actually parsed, preferring the
    last current-day row that carries a value and otherwise falling back to the
    last usable row, warning when it does so. Every check is an explicit
    `is not None`, so a legitimate `0.0` is still a reading. Regression tests: 6
    in `tests/test_processing.py`.
24. **`Location.country` is wrong for any coordinate outside Nepal.** The field
    predates the arbitrary-coordinate decision (§13.16) and still defaults to
    `"Nepal"`. Milestone 2 exposes this: the agent tool accepts any valid
    coordinate, so assessing `12.3456, -45.6789` returns an event whose
    `location.country` is `"Nepal"`. The agent fills `Location.name` with the
    coordinate itself rather than inventing a place (§18.5), but it cannot do
    anything about `country` without changing the published contract, so the
    value is reported rather than silently patched. Making the field optional is
    a contract change and belongs in a milestone that is allowed to make one.
25. **An unrecognised hazard word is reported as a missing disaster type, not an
    unsupported one.** `HAZARD_LEXICON` recognises 26 named disaster types
    (§19.3), and only those. `"Check asteroid risk at 27.7172, 85.3240"` matches
    no pattern, so `disaster_type` stays `None` and the agent asks which
    disaster type to check — a slightly odd reply to a sentence that did name
    one. This is the deliberate cost of a fixed table: a parser that inferred
    "any word after *risk*" as a hazard type would classify `"risk of being late"`
    as a hazard. Naming the limitation is better than widening the guess.

---

## 14. Limitations

**Scientific**

1. The risk engine is **rule-based, not machine-learned** (§8). It is not
   trained, not fitted, and has no measured accuracy of any kind.
2. **No thresholds are Nepal-calibrated.** They are documented assumptions, not
   official warning levels (§8.5).
3. **No validation against real flood outcomes.** Nothing in this codebase has
   been compared against a record of what actually flooded.
4. **Discharge is not gauge-verified.** It is a GloFAS model value for the
   nearest reach.
5. **Discharge is daily.** Flash-flood behaviour on small urban channels is
   invisible to this pipeline, and no hourly discharge exists in the source.
6. **No exposure modelling.** The score says nothing about how many people or
   assets are in the affected area. A low-risk location with high exposure is
   still reported as low risk.
7. **No basin routing.** Rainfall and discharge are not catchment-matched (§13.10).
8. **A "rising limb" is a 3-day proxy, not a real-time trend.** The rise
   indicator compares the current day against a multi-day mean, so it will not
   detect an intraday rise.

**Engineering**

9. Single-process, in-memory, no persistence. Every run recomputes from scratch.
10. No authentication, rate limiting or caching.
11. No geospatial index; locations are a hard-coded list of five cities.
12. The live suite depends on two third-party services being up.

**Scope**

13. Earthquake is the original prototype heuristic, not an expanded capability.
14. No AI agent, no LLM, no forecast-model, no database, no frontend, no cloud
    deployment. These are all later milestones, deliberately.
15. **Free-text parsing is a fixed table, not language understanding**
    (§19.3). It handles the documented phrasings, their capitalisations and
    their obvious variants. It does no part-of-speech tagging, no coreference
    (`"and what about tomorrow?"` is not understood), and no multi-turn context.
    Sentences with more than one hazard, or a hazard in an unusual position,
    fall outside it.
16. **A place name is not a location.** `"Check flood risk in Kathmandu"` asks
    for a coordinate rather than looking one up, because geocoding is out of
    scope (§13.25 for the related known issue).
17. **Ambiguous coordinate text is refused, not guessed.** Three numbers, or a
    malformed literal, yields no location and a follow-up question — even
    though a human would often guess correctly (§19.3).

---

## 15. Future Work

Not started. Ordered roughly by value to the project.

**To make the risk engine defensible**

1. Assemble a labelled Nepal flood dataset: DHM river-gauge records plus
   flood-inventory events, joined to the same rainfall and discharge features
   this pipeline already computes. This is the prerequisite for everything below.
2. Replace the assumed bands with **per-basin** thresholds derived from gauge
   rating curves, rather than national constants.
3. Only then, train a model (gradient boosting or a logistic baseline), and
   report real metrics — ROC-AUC, precision/recall at the operating point,
   calibration error — on a held-out period with a stated split.
4. Back-test against at least one documented historical event and report what
   the system *would* have said, including false alarms and misses.
5. Add rainfall–flood lag as a learned or fitted term instead of relying on the
   72 h window.

**Data and capability**

6. Hourly discharge, if Open-Meteo or another source adds it; otherwise
   interpolate explicitly and label it as interpolated.
7. Per-sub-basin discharge rather than nearest-reach.
8. Soil moisture and antecedent wetness as an additional indicator.
9. Cross-validate hourly rainfall totals against the daily API series (§13.7).
10. Add the Nepal DHM / OGIMET observations as a ground-truth comparison layer.
11. Honour upstream rate limits and add caching (§13.8).

**Pipeline and integration**

12. Harmonise the earthquake path onto the same output contract (§13.10).
13. Earthquake intelligence: distance attenuation, felt reports, exposure.
14. Add landslide, wildfire and severe-weather hazards as new modules under
    `risk/`, each with its own `config.py`.
15. Make the per-source `status` a closed `Literal` covering all eight values
    (§13.12), so the vocabulary is validated instead of conventional.
16. Batch assessment over a list of locations, and a watch mode that re-runs on
    a schedule.
17. A thin notification adapter that hands `IntelligenceEvent` to the Relief
    Network. **Interface only, decided with the other team** — no coupling from
    this side.
18. Persist assessments for audit and later model training.

---

## 16. Changes Made in This Milestone

### Created

| File | Purpose |
| --- | --- |
| `pipeline.py` | end-to-end orchestration of the flood path |
| `processing/__init__.py` | package docstring |
| `processing/validation.py` | safe coercion, time parsing, aggregates |
| `processing/flood_features.py` | raw payloads → validated `FloodFeatures` |
| `collectors/base.py` | shared HTTP client + failure taxonomy |
| `risk/config.py` | all thresholds, weights, bands, method metadata |
| `risk/alert.py` | alert decision stage |
| `demo/__init__.py`, `demo/fixtures.py`, `demo/scenarios.json` | labelled synthetic scenarios |
| `tests/conftest.py` | shared fixtures, fake transport, payload builders, and the session-level outbound-network guard |
| `tests/test_alert.py`, `test_collectors.py`, `test_config.py`, `test_demo_fixtures.py`, `test_fallback.py`, `test_flood_risk.py`, `test_pipeline.py`, `test_processing.py`, `test_schemas.py`, `test_api.py`, `test_live_api.py` | test suite |
| `pytest.ini` | test config, `live` marker |
| `PROJECT_STATE.md` | this file |

### Modified

| File | Change and reason |
| --- | --- |
| `collectors/weather.py` | Rewritten. Added `past_days=7` so the engine gets a real antecedent-rainfall window instead of forecast-only data; added daily variables; added local coordinate validation; routed through `fetch_json`; documented verified endpoint behaviour. |
| `collectors/flood.py` | Rewritten. Added `past_days=7` to obtain a past baseline for the rise indicator; routed through `fetch_json`; documented the verified HTTP 400 on hourly discharge. |
| `risk/flood.py` | Rewritten. The original self-referential discharge normalisation was replaced with absolute bands; added the four-indicator structure with renormalisation; added per-indicator evidence; renamed `assess_flood` → `assess_flood_risk` because the function no longer accepts raw payloads. |
| `risk/threat.py` | Rewritten. Bands now read from `config.py`; added `UNKNOWN`; added input validation; `alert_required` moved to `risk/alert.py` and re-exported here for compatibility. |
| `schemas/events.py` | Rewritten. **Removed the mandatory `confidence: float`** — it was never populated and any value would have been invented. Replaced with `data_quality`, which reports observable facts. Added `contract_version`, `assessment` (threat + alert as separate fields), `data_quality`, `DataSourceStatus`, `observation_timestamp`, origin labelling, and input validation. |
| `main.py` | Rewritten as a proper CLI (`--offline`, `--fallback-synthetic`, `--json`, `locations`, `thresholds`, `scenarios`, `--earthquake`) and a readable report printer. `run_earthquake_demo` preserved. Also added `live_collection_is_unusable` and `describe_source_failures`, and rewrote `run_flood_with_fallback` to detect a failed live attempt from the returned result rather than from an exception that can never arrive (§13.7). |
| `api.py` | Rewritten. Added `/health`, `/v1/thresholds`, `/v1/locations`, `/v1/scenarios`, `/v1/flood`, `/v1/flood/offline`, `/v1/contract`. Kept `/demo/earthquake`. A failing upstream is no longer a 502, and the `fallback_synthetic=false` 503 branch was repaired from the same dead-exception pattern (§13.7). |
| `requirements.txt` | Added `httpx2` for the API tests; recorded the verified working versions; added a note that no ML library is listed because no model is used. |
| `README.md` | Rewritten to describe the actual implementation (see below). |
| `collectors/__init__.py`, `risk/__init__.py`, `schemas/__init__.py`, `tests/__init__.py` | Replaced empty files with package docstrings. |

### Modified in the audit-response pass

| File | Change and reason |
| --- | --- |
| `risk/alert.py` | Validate coverage to a finite fraction in `[0, 1]` inside `decide_alert()`. `NaN`, `±inf`, out-of-range, `bool`, `None` and non-numeric values now produce a suppressed, manual-verification-required decision instead of `alert=True` or an exception (§13.8). |
| `processing/flood_features.py` | Forecast rainfall window changed from the inclusive `[now, now+72h]` to the half-open `[now, now+72h)`, so it holds 72 hourly samples instead of 73 (§13.10). `forecast_peak_m3s` no longer uses `or`, so a legitimate `0.0` is preserved (§13.11). Latest-discharge selection is now made from the rows whose timestamp parsed, so a `None` today-row cannot override an older usable reading and a malformed stamp cannot win (§13.23). Module docstring rewritten to document the half-open windows and state the model-grid provenance. |
| `risk/config.py` | Added `threat_band_gaps()` and wired it into `validate_config()`, so a band whose implied range is empty, uneven, or misclassified is rejected (§13.12). Added `threat_band_bounds()` and published the resolved `min_risk_score` / `max_risk_score` / `max_inclusive` in `/v1/thresholds`. Corrected the two indicator labels that called model output "observed". |
| `pipeline.py` | `location.grid_point` is now true when *either* grid source is present, not the flood grid alone (§13.13). The event message now says "Latest readings" instead of "Observed" (§13.14). |
| `risk/flood.py` | Evidence notes re-worded from "observed baseline/record" to "past baseline/record". |
| `collectors/weather.py`, `collectors/flood.py`, `collectors/__init__.py` | Docstrings re-worded: `past_days` is the model's hindcast, not an observation; the collectors package docstring now states that nothing in it reads a measuring instrument (§13.14). |
| `demo/fixtures.py` | Comment re-worded from "observed/forecast split" to "past/forecast split". |
| `README.md`, `PROJECT_STATE.md` | Terminology corrected, test counts updated to 333 + 12, band-tiling enforcement documented, live scores re-measured after the window fix, and the audit response recorded. |
| `tests/test_alert.py` | +56 tests for non-finite / out-of-range / non-numeric coverage. |
| `tests/test_processing.py` | +5 tests for the half-open windows and the zero forecast peak; +6 tests for latest-row selection (missing value, unparsable stamp, no usable rows, and `0.0` preservation). |
| `tests/test_config.py` | +5 tests for band tiling, resolved bounds and the classifier mirror; +4 tests for internal-gap and even-partition validation; the old `..._rejects_non_contiguous_threat_bands` was renamed to `..._rejects_non_increasing_threat_bands` because it only ever tested ordering. |
| `tests/test_pipeline.py` | +4 tests for `grid_point` under each source combination. |
| `tests/test_schemas.py` | +1 test pinning the arbitrary-coordinate decision. |
| `tests/test_api.py`, `tests/test_collectors.py`, `tests/test_live_api.py`, `tests/conftest.py` | Hermeticity: the earthquake collector is mocked offline, real USGS coverage moved to two opt-in live tests, and a session guard blocks non-loopback sockets for non-live tests. |
| `tests/test_flood_risk.py` | One assertion updated for the re-worded "short past record" note. |

### Added in Milestone 2 (agent tool contract)

| File | Purpose |
| --- | --- |
| `agent/tool.py` | The tool contract: `IntelligenceRequest`, `IntelligenceResponse`, the closed 6-value `ToolStatus`, `SUPPORTED_DISASTER_TYPES`, `run_intelligence_tool()`, `build_location()`, `coordinate_label()`, `describe_capabilities()`. Delegates to `main.run_flood_live` / `main.run_flood_offline`. |
| `agent/agent.py` | The deterministic agent: `AgentReply` and `handle_request()`. Asks for a missing disaster type or location, calls the tool, renders a readable answer, and always states provenance. |
| `agent/__init__.py` | Package docstring and public re-exports. |
| `agent/__main__.py` | `python -m agent` demonstration harness. Offline by default; `--live`, `--json`, `--capabilities`, `--scenario`, `--lat/--lon`. Exit codes 0 / 1 / 2. |
| `tests/test_agent.py` | 54 hermetic tests. See §18.7. |

**No Milestone 1 file was modified in Milestone 2.** `pipeline.py`,
`schemas/events.py`, `risk/*`, `processing/*`, `collectors/*`, `demo/*`, `api.py`,
`main.py`, `pytest.ini` and `requirements.txt` are byte-for-byte as they were at
the Milestone 1 lock. Verified by timestamp: every Milestone 2 file is newer
than the newest Milestone 1 file.

### Added in Milestone 2B (deterministic free-text parsing)

| File | Purpose |
| --- | --- |
| `agent/parser.py` | `parse_user_input()` (text → the existing `IntelligenceRequest`), `handle_text()` (text → the existing `AgentReply`), `describe_parsing()`, and the published `HAZARD_LEXICON`. Regular expressions only; no model, no network, no geocoding, no new schema. |
| `tests/test_parser.py` | 87 hermetic tests covering all 15 required areas. See §19.6. |

### Modified in Milestone 2B

| File | Change |
| --- | --- |
| `agent/__init__.py` | Re-exports `HAZARD_LEXICON`, `parse_user_input`, `handle_text`, `describe_parsing`; docstring now names `agent.parser`. |
| `agent/__main__.py` | Adds `--text`, routing through `handle_text()`. Offline remains the default. Every pre-existing flag is unchanged, and a typed coordinate takes precedence over `--lat/--lon`. |
| `tests/test_agent.py` | One line: the package manifest now lists `parser.py`. No test logic changed. |
| `PROJECT_STATE.md`, `README.md` | This documentation. |

**No Milestone 1 file and no Milestone 2 contract file was modified in
Milestone 2B.** `agent/tool.py` and `agent/agent.py` are unchanged, and the
Milestone 2 test file needed only the one-line manifest update above.

### Unchanged

- `collectors/earthquake.py` and `risk/earthquake.py` — the original prototype
  earthquake path. Left exactly as they were; expanding it is a later milestone.
- `.gitignore`

### Deleted

**None.** No existing implementation file was removed. The two functions that
were replaced (`risk.flood.assess_flood`, `schemas.IntelligenceResult.confidence`)
were replaced rather than deleted, and both changes are justified in §13 and in
the table above.

### Not touched

`ASSESSMENTS/`, `DOCUMENTATION/`, the workspace `README.md`, the logo assets,
the starter zip, and anything belonging to the Post-Disaster Relief Network
team.

---

## 17. Next Recommended Step

> **Superseded for the agent track.** The recommendation below was written at the
> Milestone 1 lock and assumed the next milestone would be scientific. Milestone 2
> instead built the agent tool contract (§18) and Milestone 2B built the free-text
> layer in front of it (§19). The scientific work is still the largest gap in the
> project and is *not* addressed by either; it remains the recommended next
> milestone. What Milestone 2 and 2B change is only the ordering of the agent
> items, which are listed first below.

**Agent track, in priority order:**

1. ~~**Add a free-text layer in front of `handle_request()`.**~~ **Done in
   Milestone 2B** (§19): a deterministic parser turns a sentence into the existing
   `IntelligenceRequest`, and `--text` demonstrates it. No LLM was required.
2. **Decide the `Location.country` question** (§13.24) and, if it becomes
   optional, bump `CONTRACT_VERSION` and add a test for the new shape. This is
   the one place the agent would rather have a richer location than a
   coordinate label.
3. **Harmonise earthquake onto the contract**, then widen
   `SUPPORTED_DISASTER_TYPES`. Until `assess_earthquake()` returns a real
   `IntelligenceEvent`, earthquake must stay unsupported (§18.5) — the test
   asserting that will fail loudly if someone routes it anyway. The parser
   already recognises and names 26 disaster types, so widening the supported set
   is now a one-line change plus a test.
4. Only after the above: expose the tool over the existing HTTP surface as a
   thin `/v1/agent` endpoint, reusing these exact models. Not before, because
   that would put an in-progress agent on a published interface.

**Do not** add autonomous tool-chaining, conversation memory, or multiple agents
until the single-turn path is used by someone and the failure modes are known.
An LLM may be offered in front of the parser later, but nothing in the project
needs one yet.

---

**Original Milestone 1 recommendation (still valid, not yet started):
Milestone 3 — Nepal-calibrated flood thresholds and a first genuinely trained
model.**

Rationale: the pipeline is complete, reliable and demonstrable end to end. The
single biggest gap between this prototype and a credible flood-warning system is
that the numbers are assumed rather than measured. Everything else — extra
hazards, agents, a frontend — adds surface area without improving the one
scientific claim the project actually makes.

Concretely, in priority order:

1. **Locate a labelled Nepal flood dataset** (DHM gauge records + flood
   inventory events). If none is obtainable in time, report that as a blocker
   and fall back to item 2.
2. **Replace the assumed bands with per-basin, gauge-derived levels**, and
   re-run this same test-suite against them. The tests are threshold-agnostic
   by design, so this is a configuration change, not a rewrite.
3. **Only with data in hand:** train a baseline model, report real
   train/validation metrics on a stated split, and let `confidence` enter the
   contract as a genuinely calibrated probability.
4. In parallel, low-risk and high-value: harmonise earthquake onto the
   contract, and agree the HTTP integration surface with the Relief Network team
   so the seam is fixed before either side builds on it.

**Before expanding to other hazards**, the config-threshold pattern in
`risk/config.py` should be reused as-is. A new hazard gets its own
`risk/<hazard>/` package with its own config, its own indicators and its own
tests, and inherits the pipeline, the degradation behaviour and the output
contract for free.

---

## 18. Milestone 2 — The Agent Tool Contract (as implemented)

This section documents the exact interface that was added. It is the reference
for anything built on top of it.

### 18.1 Call path

```
USER
  ↓  (a structured request; free text is not parsed)
AGENT                 agent/agent.py  handle_request()
  ↓  decides: ask, or call
TOOL                  agent/tool.py   run_intelligence_tool()
  ↓  validates; refuses unsupported types
DISASTER INTELLIGENCE main.run_flood_live() / main.run_flood_offline()
  ↓                     (unchanged Milestone 1 entry points)
                      pipeline.run_flood_pipeline()
  ↓
IntelligenceEvent    schemas/events.py  contract_version 1.0.0 — the existing
  ↓                     object, not a copy or a lookalike
AGENT                 agent/agent.py  renders a readable sentence
  ↓
USER
```

The agent never imports `risk.flood`, `risk.alert`, `risk.threat` or
`processing.flood_features`; this is asserted from the AST in
`tests/test_agent.py`, so the separation cannot rot silently.

### 18.2 Request — `agent.tool.IntelligenceRequest`

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `disaster_type` | `str \| None` | `None` | Free text, matched case-insensitively. `None` or blank asks the user. |
| `latitude` | `float \| None` | `None` | `-90..90`; not range-checked here. |
| `longitude` | `float \| None` | `None` | `-180..180`; not range-checked here. |
| `mode` | `"live" \| "offline"` | `"live"` | Both modes already existed in the CLI. |
| `scenario` | `str` | `"rising"` | Synthetic scenario used when `mode="offline"`. |

Coordinates are deliberately **not** range-constrained on the request. Bounds
are enforced by `Location` when the request becomes a location, so there is
exactly one definition of "a valid coordinate" in the repository, and an
impossible coordinate comes back as an `invalid_location` status the agent can
act on instead of a pydantic error it cannot interpret.

### 18.3 Response — `agent.tool.IntelligenceResponse`

| Field | Type | Meaning |
| --- | --- | --- |
| `status` | closed `Literal` (6 values, below) | What happened. |
| `event` | `IntelligenceEvent \| None` | The unmodified Milestone 1 contract. `None` unless `status="ok"`. |
| `next_question` | `str \| None` | What the agent should ask the user next. |
| `detail` | `str \| None` | Machine-readable explanation, for logs. |

`status` is a closed vocabulary, so a typo cannot become a state downstream code
has never seen. The six values, and the exact branch order that produces them:

| Order | `status` | Raised when |
| --- | --- | --- |
| 1 | `missing_disaster_type` | `disaster_type` is `None` or blank. |
| 2 | `unsupported_disaster` | The type is present but is not `flood`. Checked **before** the location, because no extra input can change it. |
| 3 | `missing_location` | Either coordinate is `None`. Half a coordinate is not a location. |
| 4 | `invalid_location` | `Location(...)` rejected the pair: out of range, or `NaN`/`inf`. |
| 5 | `invalid_scenario` | `mode="offline"` named a synthetic scenario that does not exist. |
| 6 | `ok` | The pipeline ran. `event` is populated. |

A **data-source failure is deliberately not a status.** The pipeline already
reports it honestly inside `event.data_quality` (§7, §11); re-reporting it here
would hide it behind a second, contradictory state. The tool passes the
assessment through untouched.

### 18.4 Agent reply — `agent.agent.AgentReply`

`status`, `message` (never empty), `event` (passed straight through), and
`needs_input`. Every non-`ok` status yields `needs_input=True` and a `message`
that leads with its own plain-language explanation and then ends with the tool's
`next_question` verbatim — so the agent never invents a follow-up of its own.

A successful answer always states provenance. Synthetic results are labelled
`SYNTHETIC demo data, not a live observation`, degraded ones
`live data, but at least one source failed`.

### 18.5 Location representation

Coordinates only. There is no geocoding, no place name and no admin-area
resolution. The contract requires `Location.name`, so `coordinate_label()`
fills it with the coordinate itself (`"27.7172, 85.3240"`) rather than inventing
a place. See §13.24 for the `country` field this leaves wrong.

`SUPPORTED_DISASTER_TYPES` is `frozenset({"flood"})`. `earthquake` is reported
as unsupported because `risk/earthquake.py::assess_earthquake()` returns a bare
`dict` with a different field set and no contract version; serving it would mean
inventing a second, competing result schema. A test asserts both halves of that
claim.

### 18.6 Demonstration

```
python -m agent                                # offline, Kathmandu
python -m agent --lat 27.7172 --lon 85.3240    # offline, any point
python -m agent --live                         # real Open-Meteo + GloFAS
python -m agent --scenario severe              # offline, different scenario
python -m agent --json                         # full reply as JSON
python -m agent --capabilities                 # what the tool supports
```

Exit codes: `0` answered, `1` the agent needs something from the user, `2`
answered but the pipeline had no usable data. Offline is the default so a demo
cannot fail on a bad connection.

### 18.7 Tests added — 54, all offline

`tests/test_agent.py`, hermetic. Every test that reaches the pipeline uses
`mode="offline"`; the single test covering the `live` branch replaces
`run_flood_live` with a recorder, so the branch is covered without a socket.

Covered: valid flood request; arbitrary coordinates including one outside Nepal;
coordinate-as-label (no geocoding); missing disaster type (3 cases);
case-insensitive matching; missing location; half a location (2 cases);
invalid coordinates (7 cases: out of range both ways, `NaN`, `inf`); bounds
delegated to `Location`; unsupported types (5 cases) refused rather than routed
to flood; the earthquake incompatibility claim; a real `IntelligenceEvent` with
**every** Milestone 1 field present; synthetic labelling; invalid scenario; the
live branch; each agent behaviour; the closed status vocabulary; and four
scope guards read from the AST — no risk-internals import, no LLM dependency, no
network transport, no `DEMO_LOCATIONS` dependency, and no second event schema.

### 18.8 What is NOT implemented

Free-text / NLU request parsing *(built in Milestone 2B — see §19)*; geocoding;
place names; admin areas; a map; any change to the HTTP API; any new disaster
model; autonomous or multi-step agent behaviour; conversation memory; tool
chaining; an LLM; the Post-Disaster layer.

There is **no autonomous AI agent here.** `handle_request()` is a function with
five branches.

---

## 19. Milestone 2B — Deterministic Free-Text Request Parsing

A sentence goes in, the **existing** `IntelligenceRequest` comes out. No language
model, no network, no geocoding, no new schema.

### 19.1 Call path

```
"Check flood risk at 27.7172, 85.3240"
        │
        ▼
agent.parser.parse_user_input()      regex only: 3 fields out
        │                            IntelligenceRequest(disaster_type,
        ▼                            latitude, longitude, mode, scenario)
agent.agent.handle_request()         unchanged, Milestone 2
        │
        ▼
agent.tool.run_intelligence_tool()   unchanged, Milestone 2
        │
        ▼
main.run_flood_offline() / _live()  unchanged, Milestone 1
        │
        ▼
IntelligenceEvent  →  AgentReply
```

`handle_text()` is the two-line composition of the first two steps, so free text
and a structured `IntelligenceRequest` reach the agent by **one** path. A test
asserts both produce a byte-identical message and event.

### 19.2 Interface

| Function | Signature | Returns |
| --- | --- | --- |
| `parse_user_input` | `(text: str, *, mode: RequestMode = "live", scenario: str = "mild") -> IntelligenceRequest` | the **existing** request type |
| `handle_text` | `(text: str, *, mode: RequestMode = "live", scenario: str = "mild") -> AgentReply` | the **existing** reply type |
| `describe_parsing` | `() -> dict` | JSON-safe description of the rules below |

All three are exported from `agent`. `mode` and `scenario` are passed straight
through; the parser never chooses them, and never inspects them.

### 19.3 Parsing rules, as implemented

**Disaster type.** A published table `HAZARD_LEXICON` of regular expressions
maps a word to a canonical type. It recognises **26 types** — every one of them
recognised, so an unsupported request can be refused *by name* — while
`SUPPORTED_DISASTER_TYPES` remains `frozenset({"flood"})`.

Tie-break, in order: **earliest mention wins**, then the longer phrase. So
`"storm surge"` → `storm_surge` rather than `storm`, and `"flood risk near the
fire station"` → `flood`, not `wildfire`. Both directions are tested.

Recognised: flood, floodings, flash flood, earthquake, quake, seismic,
landslide, landslide/landslip, wildfire, forest fire, fire, cyclone, hurricane,
typhoon, storm surge, storm, tsunami, avalanche, drought, hail, hailstones,
hailstorm, snowstorm, blizzard, heat wave, cold wave, tornado, volcano.

**Coordinates.** Latitude first, then longitude. The rule is deliberately strict:

| Text | Result |
| --- | --- |
| `27.7172, 85.3240` | ✅ parsed |
| `-12.3456, 45.6789`, `12.3456,-45.6789`, `+27.7172, +85.3240` | ✅ parsed |
| `27.7172` (one number) | ❌ no location → asked for |
| `27.7172, 85.3240, 12.5` (three) | ❌ no location → asked for |
| `3.4.5, 85.3` (malformed) | ❌ no location → asked for |
| `v1.5`, `abc123` (in identifiers) | ❌ no location → asked for |
| `1e400` (scientific notation) | ❌ no location → asked for |
| `nan`, `NaN`, `inf`, `-inf`, `Infinity` | ❌ no location → asked for |
| a 400-digit integer (overflows `float()`) | ❌ no location → asked for |
| `Kathmandu` (a place name) | ❌ no location → asked for |

**Exactly two finite decimal numbers, or nothing.** Anything ambiguous produces
*no* location and the existing agent asks for one. A parser that guesses between
three candidate coordinates is worse than one that says "which point?".

**No duplicated coordinate validation.** The parser holds no bounds of its own.
`"100.7172, 85.3240"` is extracted faithfully and then rejected by the existing
`Location` as `invalid_location` — a single source of truth for what a real
coordinate is, proven by a test asserting `-90`/`180` appear nowhere in the
parser source.

### 19.4 Observed behaviour

```
"Check flood risk at 27.7172, 85.3240"   -> ok, MODERATE
"CHECK FLOODING RISK AT -12.3456, 45.6789" -> ok, MODERATE
"Check 27.7172, 85.3240"                 -> missing_disaster_type
"Check flood risk"                       -> missing_location
"Check flood risk in Kathmandu"          -> missing_location (no geocoding)
"Check flood risk at 100.7172, 85.3240"  -> invalid_location
"Check flood risk at 3.4.5, 85.3240"     -> missing_location
"Check flood risk at NaN, Infinity"      -> missing_location
"Check earthquake risk at 27.7172, 85.3240" -> unsupported_disaster
"Check landslide risk at 27.7172, 85.3240"  -> unsupported_disaster
```

Every status above is produced by the **existing** tool, not by the parser. The
parser cannot invent a status; it only fills in three fields or leaves them
`None`.

**The single most important property:** an unsupported disaster is *never*
answered with a flood assessment. A test asserts this for earthquake, landslide
and wildfire, and that the reply contains no `"Flood threat"` string.

### 19.5 Demonstration

```
python -m agent --text "Check flood risk at 27.7172, 85.3240"
python -m agent --text "Check earthquake risk at 27.7172, 85.3240"
python -m agent --text "what is the flood risk" --live
python -m agent --text "Flood at 27.7172, 85.3240" --json
```

`--text` routes the sentence through the parser; `--lat`/`--lon`/`--type` are
not consulted when it is present, because a caller who typed a coordinate means
it. Every pre-existing flag behaves exactly as before, including the offline
default, and that is covered by tests rather than by inspection.

### 19.6 Tests added — 87, all offline

`tests/test_parser.py`, hermetic. Covered, by the 15 required areas: valid
positive coordinates; negative coordinates; case-insensitive flood;
`flooding`/`floods`/`flooded`/`flash flood`; missing disaster; missing location;
unsupported earthquake; unsupported landslide; invalid latitude; invalid
longitude; malformed coordinate text; successful end-to-end offline; the
`IntelligenceEvent` preserved intact; no network; and no `risk.*` /
`processing.*` import.

Plus: first-mention and longest-phrase tie-breaks in both directions; four
out-of-range cases preserved then rejected; bounds-just-outside; the absence of
parser-side bounds; five non-finite forms; a 400-digit integer; place names
refused; 21 hostile inputs that must not raise; a non-string request (a number,
a dict, a list) asked about rather than crashing; both modes free of sockets
(including `live`); the public function set pinned to exactly five names; no
`class` and no `BaseModel` in the module; determinism over six runs;
pass-through of `mode`/`scenario`; `describe_parsing()` being JSON-safe with
`allow_nan=False`; and the `--text` CLI routing, JSON output, offline default,
and five pre-existing flag behaviours.

### 19.7 What is NOT implemented

A language model; general NLU; part-of-speech tagging; coreference; multi-turn
conversation memory; geocoding; place names; admin areas; a map; any change to
the HTTP API; any new disaster model; autonomous or multi-step agent behaviour;
tool chaining; the Post-Disaster layer.

A word the lexicon does not know is reported as `missing_disaster_type` rather
than guessed at — a known and deliberate limitation (§13).
