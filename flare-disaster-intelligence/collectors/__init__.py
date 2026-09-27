"""External data collectors.

Every collector in this package returns **numerical model output on a grid**.
None of them reads a physical measuring instrument, so nothing here is an
observation in the station/gauge sense. The "past" portion of each series is the
model's own hindcast for elapsed hours.

Each collector performs I/O only: it builds a query, calls
:func:`collectors.base.fetch_json`, and returns the raw decoded payload. No
interpretation happens here, and no collector ever invents a value. If a source
cannot be reached, the collector raises ``DataSourceError`` with a classified
reason rather than returning a fabricated result.

* ``base``    - shared HTTP access and the failure taxonomy
* ``weather`` - Open-Meteo Forecast API (past + forecast rainfall)
* ``flood``   - Open-Meteo Flood API / GloFAS (modelled river discharge)
* ``earthquake`` - USGS real-time GeoJSON feed (original prototype, unchanged)
"""
