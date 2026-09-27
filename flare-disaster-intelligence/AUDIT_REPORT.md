# FLARE DISASTER INTELLIGENCE - INDEPENDENT AUDIT

## 1. EXECUTIVE VERDICT

**PASS WITH FIXES - minor/important fixes needed**

- The flood pipeline is implemented end to end and is readable.
- Default tests reproduced `248 passed, 10 skipped`; `258 collected`.
- Fallback correctly inspects returned pipeline results.
- Synthetic data is labelled in the output contract.
- Risk scoring is rule-based, not machine learning.
- Alerting suppresses partial-data HIGH/CRITICAL results.
- The default suite is not fully hermetic because `/demo/earthquake` calls USGS.
- Direct `decide_alert()` accepts invalid `NaN` coverage and can alert.
- Documentation overstates historical weather as "observed".
- Location support is limited to five hardcoded named locations.
- The foundation is suitable for a narrow agentic layer after the safety/test fixes.

## 2. WHAT IS ACTUALLY IMPLEMENTED

```text
Location
-> Open-Meteo weather collector
-> Open-Meteo Flood/GloFAS collector
-> validation and timestamp alignment
-> rainfall/discharge feature extraction
-> weighted rule-based risk score
-> threat classification
-> alert decision
-> IntelligenceEvent
-> CLI or FastAPI
```

Main implementation files:

- `pipeline.py`
- `collectors/base.py`
- `processing/validation.py`
- `processing/flood_features.py`
- `risk/flood.py`
- `risk/threat.py`
- `risk/alert.py`
- `schemas/events.py`
- `api.py`

Not implemented: trained ML, AI agents, geocoding, map integration, database, cloud deployment, advanced GIS, or expanded multi-hazard intelligence.

## 3. VERIFIED

### Architecture

- `run_flood_pipeline()` collects both sources, records failures, builds features, calculates risk, classifies threat, decides alerts, and creates `IntelligenceEvent`.
- Collection failures do not normally escape the pipeline.
- The pipeline distinguishes risk score, threat level, and alert decision.
- `UNKNOWN` is used when no indicator is available.

### Data sources

- Weather: `https://api.open-meteo.com/v1/forecast`
- River discharge: `https://flood-api.open-meteo.com/v1/flood`
- Earthquake prototype: USGS `all_day.geojson`
- Synthetic scenarios: `demo/scenarios.json`

Weather and flood requests pass latitude, longitude, UTC timezone, historical/forecast windows, and requested variables.

### Failure handling

`collectors/base.py` defines:

- `timeout`
- `network_unreachable`
- `http_error`
- `invalid_request`
- `malformed_json`
- `unexpected_payload`

The pipeline additionally records:

- `empty_payload`
- `unexpected_error`

Timeouts, network errors, 5xx responses, malformed JSON, and unexpected JSON payloads are retried by the current implementation. 4xx responses are not retried.

### Validation and features

Verified behavior includes finite numeric coercion, rejection of booleans/NaN/infinity/invalid strings/containers, timestamp parsing, series alignment, preservation of missing values as `None`, rainfall windows, daily discharge handling, malformed payload warnings, and discarded-value counts.

Actual flood indicators:

- Past 72-hour rainfall
- Next 72-hour rainfall
- Current/latest discharge
- Latest discharge divided by observed baseline

Risk weights:

```text
antecedent rainfall: 0.30
forecast rainfall:   0.15
discharge level:     0.35
discharge rise:      0.20
```

The score is a weighted, renormalized composite index. It is not ML or statistical inference.

### Threat and alert behavior

```text
LOW:      [0.00, 0.25)
MODERATE: [0.25, 0.50)
HIGH:     [0.50, 0.75)
CRITICAL: [0.75, 1.00]
```

Automatic alert requires HIGH or CRITICAL and coverage of at least `1.0`.

Therefore:

- CRITICAL + complete data -> alert
- CRITICAL + partial data -> suppress and require manual verification
- UNKNOWN -> no alert, acquire data
- `SUPPRESS` is not represented as "safe"; it is a boolean suppression state

### API and CLI

Verified API routes:

- `GET /health`
- `GET /v1/thresholds`
- `GET /v1/locations`
- `GET /v1/scenarios`
- `GET /v1/contract`
- `GET /v1/flood`
- `GET /v1/flood/offline`
- `GET /demo/earthquake`

Verified CLI:

```text
python main.py locations
python main.py thresholds
python main.py scenarios
python main.py --offline --scenario severe
```

`python main.py --locations` is invalid; locations is a subcommand.

## 4. DISCREPANCIES / ISSUES

### Issue 1

**Severity:** HIGH  
**Location:** `tests/test_api.py`, `collectors/earthquake.py`  
**Claim:** The default suite is hermetic and makes no network calls.  
**Actual:** `test_earthquake_endpoint_is_still_available` calls `/demo/earthquake`, which performs a real USGS request.  
**Why it matters:** Default tests depend on external availability.  
**Recommended action:** Mock the earthquake path or move the test into the opt-in live suite.

### Issue 2

**Severity:** HIGH  
**Location:** `risk/alert.py`  
**Claim:** Coverage is a fraction in `[0, 1]` and alerting is fail-safe.  
**Actual:** `decide_alert("CRITICAL", coverage=float("nan"))` returns `alert=True`. Values above `1.0` also pass.  
**Why it matters:** The public alert function can publish an invalid high-severity result.  
**Recommended action:** Validate finite coverage and enforce `[0, 1]` inside `decide_alert()`.

### Issue 3

**Severity:** MEDIUM  
**Location:** `risk/config.py`, `risk/threat.py`  
**Claim:** Threat bands tile `[0, 1]` contiguously.  
**Actual:** Validation checks increasing boundaries but not actual adjacency or final coverage.  
**Why it matters:** Configuration can silently produce undocumented threat behavior.  
**Recommended action:** Validate contiguous boundaries and test a genuine gap.

### Issue 4

**Severity:** MEDIUM  
**Location:** `processing/flood_features.py`  
**Claim:** Forecast rainfall covers exactly the next 72 hours.  
**Actual:** The upper bound is inclusive: `now <= moment <= now + 72h`.  
**Why it matters:** A boundary value can create a 73-hour window.  
**Recommended action:** Use a half-open interval and add a boundary test.

### Issue 5

**Severity:** MEDIUM  
**Location:** `processing/flood_features.py`  
**Claim:** Forecast peak discharge is published accurately.  
**Actual:** `max_or_none(forecast) or max_or_none(current)` treats a valid forecast peak of `0.0` as missing.  
**Why it matters:** Evidence can report the wrong forecast peak.  
**Recommended action:** Distinguish `None` from numeric zero.

### Issue 6

**Severity:** MEDIUM  
**Location:** `pipeline.py`  
**Claim:** Grid provenance is disclosed for modelled inputs.  
**Actual:** `Location.grid_point` is set only from `features.flood_grid`. Weather-only model-grid use can report `grid_point=False`.  
**Why it matters:** The output can under-report gridded data use.  
**Recommended action:** Base the flag on either available grid result.

### Issue 7

**Severity:** MEDIUM  
**Location:** `PROJECT_STATE.md`, `README.md`, `collectors/weather.py`  
**Claim:** Historical weather is described as real observed data.  
**Actual:** Open-Meteo model/grid output is used.  
**Why it matters:** Calling model/reanalysis values "observed" can create false scientific confidence.  
**Recommended action:** Consistently call these modelled historical/reanalysis values.

### Issue 8

**Severity:** MEDIUM  
**Location:** `main.py`, `demo/fixtures.py`  
**Claim:** CLI behavior is suitable for demonstrations.  
**Actual:** An unknown offline scenario produces a Python traceback and exit code 1.  
**Why it matters:** Demo operators receive implementation details instead of a controlled error.  
**Recommended action:** Convert expected scenario errors into concise CLI errors.

### Issue 9

**Severity:** MEDIUM  
**Location:** `requirements.txt`  
**Claim:** `httpx2` is the required FastAPI test dependency.  
**Actual:** FastAPI/Starlette `TestClient` imports the `httpx` module.  
**Why it matters:** A clean installation may not reproduce the current environment.  
**Recommended action:** Verify the dependency in a clean environment.

### Issue 10

**Severity:** LOW  
**Location:** `schemas/events.py`  
**Claim:** The output is ready for future location-aware integration.  
**Actual:** `Location` has `name`, latitude, longitude, country, and grid point. There is no `place_name` or `area_description`.  
**Why it matters:** Ward-level or administrative map display requires an API/schema extension.  
**Recommended action:** Add those fields in a deliberately versioned future contract change.

## 5. REQUIRED FIXES BEFORE AGENTIC LAYER

1. Validate finite `[0, 1]` coverage inside `decide_alert()`.
2. Make the default test suite genuinely network-independent.
3. Correct the weather "observed" terminology.
4. Enforce contiguous threat bands.
5. Fix the discharge zero-value evidence edge case.
6. Decide whether the location contract must support arbitrary coordinates before exposing it as an agent tool.

## 6. AGENTIC LAYER READINESS

Ready:

- Structured flood pipeline callable through one function.
- Stable JSON event shape.
- Explicit threat, alert, coverage, warnings, and provenance.
- Offline scenarios for deterministic demonstrations.
- API routes suitable for a simple tool wrapper.

Missing:

- API input for arbitrary latitude/longitude.
- Place-name resolution or geocoding.
- `place_name` and `area_description`.
- Stronger input validation at the alert boundary.

A minimal tool can accept disaster type, latitude, longitude, optional place metadata, and live/synthetic mode, then return `IntelligenceEvent`.

## 7. LOCATION / MAP READINESS

- Coordinates: supported internally by `Location`; API accepts only named demo locations.
- Place names: supported only as the existing `Location.name`; no resolution.
- Area descriptions: not supported.
- Threat-colored markers: possible from `assessment.threat_level`.
- Risk display: possible from `risk_score`.
- Model-grid coordinates: present in `evidence.model_grid`.

A simple map requires no flood polygons, but arbitrary coordinate input and richer location metadata require API/schema changes.

## 8. SAFETY CONCERNS

- Modelled historical weather is easy to misread as direct observation.
- The default `/v1/flood` route may fall back to synthetic data and return HTTP 200, although the payload is labelled.
- Partial data returns HTTP 200 with a usable-looking risk score; clients must inspect `data_quality` and suppression fields.
- Direct invalid `NaN` coverage can cause an alert.
- Thresholds are prototype assumptions, not Nepal-calibrated warning thresholds.
- GloFAS discharge is daily modelled river data, not a verified local gauge.
- No stale-data or freshness policy is enforced.

## 9. TEST VERIFICATION

Fresh results obtained:

```text
Default suite: 248 passed, 10 skipped
Collected:     258 tests
```

One opt-in live test was independently run and passed:

```text
1 passed, 9 deselected
```

A full live-suite attempt produced incomplete progress output and no final summary. Therefore the historical claim of 10 live tests passing is **NOT VERIFIED** in this audit.

Important missing tests:

- NaN and out-of-range coverage in `decide_alert()`
- genuinely gapped threat bands
- forecast rainfall exact upper boundary
- zero forecast discharge peak
- weather-only grid provenance
- CLI unknown-scenario behavior
- clean-install dependency verification
- complete network isolation of the default suite

## 10. DOCUMENTATION ACCURACY

### PROJECT_STATE.md

Mostly accurate about the implemented flood architecture and explicit limitations.

Important issues:

- Claims the unit suite is hermetic, but the earthquake API test performs a real request.
- Calls historical Open-Meteo weather "observed" in places where the implementation is model/grid data.
- Claims threat bands are validated as contiguous, but validation only checks increasing boundaries.
- Historical live-run counts and exact API observations are not reproducible from the repository alone.

### README.md

Generally aligned with the current code.

Important issues:

- The "unit suite never touches the network" claim is false because of the earthquake test.
- Weather terminology can imply direct observation.
- The default `/v1/flood` route can return synthetic fallback data with HTTP 200; consumers must inspect provenance.
- The dependency declaration should be verified in a clean installation.
- CLI documentation correctly uses `python main.py locations`; `--locations` is not supported.

## 11. FUTURE WORK

### A. Reasonable next steps

- Fix alert input validation.
- Make tests genuinely hermetic.
- Correct modelled-versus-observed terminology.
- Add arbitrary coordinate API input.
- Version location metadata additions.
- Add data freshness and source-age fields.
- Create a narrow flood assessment tool for the agent.

### B. Advanced features not to attempt tonight

- Nepal-trained flood ML model without labelled data.
- High-resolution flood polygons.
- Advanced GIS or hydrodynamic modelling.
- Multi-hazard ML.
- Full earthquake, landslide, wildfire, and severe-weather intelligence.
- Production database and cloud deployment.
- Autonomous emergency actions.
- Sophisticated autonomous LLM reasoning.

## 12. DEMO PLAN

Safest offline demonstration:

```text
python main.py --offline --scenario severe
```

Expected result:

```text
threat_level: CRITICAL
alert: True
origin: synthetic_demo
is_synthetic: True
```

Safest live demonstration:

```text
python main.py --location kathmandu --json
```

State clearly that the result uses Open-Meteo model/grid data and prototype assumptions.

Avoid presenting synthetic output as live, claiming scientific prediction accuracy, depending on `/demo/earthquake`, or treating CRITICAL as an automatic real-world warning.

## 13. FINAL RECOMMENDATION

**SAFE TO PROCEED AFTER FIXES**

Priority actions:

1. Make `decide_alert()` reject NaN and invalid coverage.
2. Remove the real USGS dependency from the default test suite.
3. Correct modelled-data terminology in documentation.
4. Fix threat-band validation and the zero forecast-peak edge case.
5. Define the minimal coordinate/location interface before exposing the pipeline to an agent.
