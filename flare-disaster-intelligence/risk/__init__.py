"""Hazard-specific risk assessment.

Layering, deliberately kept visible:

``risk/config.py``
    Every threshold, weight and band. No threshold is hard-coded anywhere else.
``risk/flood.py``
    The flood risk engine: features -> normalised indicators -> risk score.
``risk/threat.py``
    Risk score -> threat level. Knows nothing about scoring.
``risk/alert.py``
    Threat level + data quality -> alert. Knows nothing about scoring.
``risk/earthquake.py``
    The original prototype earthquake heuristic, carried over unchanged in scope.
"""
