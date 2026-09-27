"""Data processing: turn raw API payloads into validated, hazard-specific data.

This package sits between ``collectors`` (I/O) and ``risk`` (assessment).
Its job is to align time axes, discard unreadable values, and reduce the raw
payloads to the small set of named features the risk engine is allowed to use.
"""
