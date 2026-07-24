"""
summarizer.py — Hourly summary generation for the LabPulse agent.
Wraps tracker snapshot into the JSON payload for AWS ingestion.
Walchand Institute of Technology, Solapur
"""
import logging
import time
import uuid

logger = logging.getLogger(__name__)


def build_summary(
    tracker_snapshot: dict,
    session_id: str,
    student_id: str,
    machine_id: str,
    lab_id: str,
    hour_start: str,
    hour_end: str,
    timetable_slot: str = "NONE",
) -> dict:
    """
    Build the hourly summary payload from a tracker snapshot.
    This is the JSON that gets POSTed to /v1/agent/summary.

    Includes:
      - App names and durations
      - Input counts (no key values, no text)
      - Browser activity: per-site durations, page titles, URLs
    """
    # Sort apps by active_duration descending
    apps_sorted = sorted(
        tracker_snapshot["app_usage"].items(),
        key=lambda x: x[1]["active_duration"],
        reverse=True,
    )

    # Browser activity data (may be empty if no browser was used)
    browser_activity = tracker_snapshot.get("browser_activity", {})
    browser_sites = browser_activity.get("sites", [])
    browser_page_log = browser_activity.get("page_log", [])

    payload = {
        "report_id": f"{session_id}#{hour_start}",   # idempotency key
        "session_id": session_id,
        "student_id": student_id,
        "machine_id": machine_id,
        "lab_id": lab_id,
        "hour_start": hour_start,
        "hour_end": hour_end,
        "date": hour_start[:10],                       # YYYY-MM-DD
        "timetable_slot": timetable_slot,
        "summary": {
            "app_usage": [
                {
                    "app_name": app,
                    "active_duration": info["active_duration"],
                    "open_count": info["open_count"],
                }
                for app, info in apps_sorted
            ],
            "behavior": {
                "keyboard_count": tracker_snapshot["keyboard_count"],
                "mouse_click_count": tracker_snapshot["mouse_click_count"],
                "mouse_move_count": tracker_snapshot["mouse_move_count"],
                "active_time": tracker_snapshot["active_time"],
                "idle_time": tracker_snapshot["idle_time"],
            },
            "browser_activity": {
                "sites": browser_sites,
                "page_log": browser_page_log,
            },
        },
        "agent_version": "1.1.0",
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    return payload


def hour_boundary(dt_struct=None) -> tuple[str, str]:
    """Return (hour_start, hour_end) ISO strings for the current or given hour."""
    if dt_struct is None:
        dt_struct = time.gmtime()
    start = time.strftime(
        "%Y-%m-%dT%H:00:00Z",
        time.struct_time((*dt_struct[:4], 0, 0, *dt_struct[6:])),
    )
    end_hour = (dt_struct.tm_hour + 1) % 24
    end = time.strftime(
        "%Y-%m-%dT%H:00:00Z",
        time.struct_time((*dt_struct[:3], end_hour, 0, 0, *dt_struct[6:])),
    )
    return start, end
