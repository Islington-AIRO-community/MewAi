from math import exp
from .threat import classify_threat, alert_required

def assess_earthquake(events: list[dict], latitude: float, longitude: float) -> dict:
    if not events:
        return {
            "risk_score": 0.0,
            "threat_level": "LOW",
            "alert": False,
            "evidence": {"events_considered": 0},
        }

    # Prototype severity score based on magnitude and depth.
    # Geographic attenuation/population exposure will be added later.
    best = max(events, key=lambda e: e.get("magnitude") or 0)
    magnitude = float(best.get("magnitude") or 0)
    depth = float(best.get("depth_km") or 0)

    magnitude_component = max(0.0, min(1.0, (magnitude - 3.5) / 3.0))
    depth_component = exp(-max(depth, 0.0) / 100.0)
    risk = round(min(1.0, 0.75 * magnitude_component + 0.25 * depth_component), 3)

    threat = classify_threat(risk)
    return {
        "risk_score": risk,
        "threat_level": threat,
        "alert": alert_required(threat),
        "evidence": {
            "events_considered": len(events),
            "highest_magnitude": magnitude,
            "highest_magnitude_depth_km": depth,
            "nearest_event_note": "Distance calculation will be added in the next implementation milestone.",
        },
    }
