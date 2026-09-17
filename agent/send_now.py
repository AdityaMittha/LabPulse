r"""
send_now.py — Manually send agent data to AWS Cloud immediately.

Captures current machine activity (foreground app, active window, system telemetry),
generates a summary payload, sends a heartbeat ping, and flushes the offline queue.

Usage:
  cd agent
  .\venv\Scripts\python send_now.py
  # or
  python send_now.py
"""

import os
import sys
import time
import uuid

# Add agent src to path
SRC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "src")
sys.path.insert(0, SRC_DIR)

from config import get_config
from tracker import ActivityTracker, _get_foreground_app
from summarizer import build_summary, hour_boundary
from uploader import Uploader
from offline_store import load_pending_session

def main():
    print("=" * 60)
    print("  LabPulse Agent — Send Data to Cloud Now")
    print("=" * 60)

    config = get_config()
    machine_id = config.get("machine_id", "UNKNOWN-PC")
    lab_id = config.get("lab_id", "UNKNOWN-LAB")
    api_url = config.get("api_base_url", "")

    print(f"  Machine:  {machine_id}")
    print(f"  Lab:      {lab_id}")
    print(f"  Endpoint: {api_url}")
    print("-" * 60)

    uploader = Uploader(config)

    # 1. Send Heartbeat to mark PC Online
    print("\n[1/3] Sending Heartbeat...")
    hb_ok = uploader.send_heartbeat(machine_id)
    if hb_ok:
        print("  [OK] Heartbeat acknowledged (Machine status: Online)")
    else:
        print("  [!] Heartbeat returned error or offline (check API key / machine registration)")

    # 2. Flush any pending offline queue items
    print("\n[2/3] Checking offline queue...")
    q_size = uploader.queue_size()
    if q_size > 0:
        print(f"  Found {q_size} queued items. Flushing to cloud...")
        uploader._flush_queue()
        remaining = uploader.queue_size()
        print(f"  Remaining in queue: {remaining}")
    else:
        print("  Offline queue is empty (all previous items synced).")

    # 3. Capture active telemetry and upload summary
    print("\n[3/3] Sampling current activity (3 seconds)...")
    tracker = ActivityTracker(idle_threshold_seconds=5)
    try:
        tracker._start_pynput()
    except Exception:
        tracker._start_pynput = lambda: None
    tracker.start()

    for i in range(3):
        app = _get_foreground_app()
        print(f"  [{i+1}/3] Active Foreground App: {app}")
        time.sleep(1)

    snapshot = tracker.snapshot_and_reset()
    tracker.stop()

    arg_student = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("-") else None
    pending = load_pending_session()
    timetable_slot = "NONE"

    if pending:
        session_id = pending.get("session_id", str(uuid.uuid4()))
        student_id = arg_student or pending.get("student_id", "LOCAL_USER")
        timetable_slot = pending.get("timetable_slot", "NONE")
    elif arg_student:
        student_id = arg_student
        session_id = str(uuid.uuid4())
        try:
            import boto3
            from boto3.dynamodb.conditions import Key
            dynamodb = boto3.resource("dynamodb", region_name="ap-south-1")
            sess_tbl = dynamodb.Table("labpulse-Sessions")
            resp = sess_tbl.query(
                IndexName="by_student",
                KeyConditionExpression=Key("student_id").eq(student_id),
                Limit=1,
                ScanIndexForward=False,
            )
            items = resp.get("Items", [])
            if items:
                latest = items[0]
                session_id = latest["session_id"]
                machine_id = latest.get("machine_id", machine_id)
                lab_id = latest.get("lab_id", lab_id)
                timetable_slot = latest.get("timetable_slot", "NONE")
                print(f"  Attached to student {student_id}'s latest session ({session_id[:8]}...) on {machine_id}")
        except Exception as exc:
            pass
    else:
        session_id = str(uuid.uuid4())
        student_id = "LIVE_AGENT_SYNC"

    # Ensure any foreground apps observed during the sample are registered
    fg_app = _get_foreground_app()
    if fg_app and fg_app not in ("Desktop", "Unknown"):
        if fg_app not in snapshot["app_usage"]:
            snapshot["app_usage"][fg_app] = {
                "active_duration": 3,
                "open_count": 1,
            }

    hour_start, hour_end = hour_boundary()
    payload = build_summary(
        tracker_snapshot=snapshot,
        session_id=session_id,
        student_id=student_id,
        machine_id=machine_id,
        lab_id=lab_id,
        hour_start=hour_start,
        hour_end=hour_end,
        timetable_slot=timetable_slot,
    )

    print("\n  Uploading telemetry summary to AWS...")
    uploader.upload_summary(payload)
    print(f"  [OK] Summary Report ID: {payload['report_id']}")
    print(f"  Apps Captured: {[a['app_name'] for a in payload['summary']['app_usage']] or ['Idle/Desktop']}")

    print("\n" + "=" * 60)
    print("  Sync Complete! Check AWS DynamoDB & Dashboard.")
    print("=" * 60)

if __name__ == "__main__":
    main()
