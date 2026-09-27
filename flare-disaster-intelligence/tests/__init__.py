"""Automated tests for the FLARE Disaster Intelligence Layer.

The suite is split by what it actually verifies:

* ``test_threat.py``       - risk score -> threat level, including boundaries
* ``test_alert.py``        - threat level + coverage -> alert decision
* ``test_flood_risk.py``   - risk arithmetic with hand-checkable inputs
* ``test_processing.py``   - validation, missing/null/malformed data handling
* ``test_collectors.py``   - HTTP error classification with a faked transport
* ``test_config.py``       - threshold consistency and honesty guarantees
* ``test_schemas.py``      - the output contract and its refusals
* ``test_pipeline.py``     - end-to-end with injected collectors, incl. failures
* ``test_api.py``          - HTTP endpoints, in-process, offline
* ``test_demo_fixtures.py``- synthetic scenarios and their labelling
* ``test_live_api.py``     - REAL network calls, opt-in via ``FLARE_LIVE_TESTS=1``

Only ``test_live_api.py`` touches the network, and it is skipped unless
``FLARE_LIVE_TESTS=1`` is set. Everything else is hermetic.
"""
