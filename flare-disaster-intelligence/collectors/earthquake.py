import requests

USGS_FEED = (
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/"
    "all_day.geojson"
)

def get_recent_earthquakes() -> dict:
    response = requests.get(USGS_FEED, timeout=15)
    response.raise_for_status()
    return response.json()

def extract_significant_events(feed: dict, min_magnitude: float = 4.5) -> list[dict]:
    events = []
    for feature in feed.get("features", []):
        props = feature.get("properties", {})
        geometry = feature.get("geometry", {})
        coords = geometry.get("coordinates", [None, None, None])
        magnitude = props.get("mag")
        if magnitude is not None and magnitude >= min_magnitude:
            events.append({
                "id": feature.get("id"),
                "magnitude": magnitude,
                "place": props.get("place"),
                "time_ms": props.get("time"),
                "longitude": coords[0],
                "latitude": coords[1],
                "depth_km": coords[2],
                "alert": props.get("alert"),
                "url": props.get("url"),
            })
    return events
