"""
session_end/handler.py — Lambda: finalize session, compute compliance status.
Walchand Institute of Technology, Solapur — LabPulse Backend

Compliance rules:
  - compliant:     active_time >= 70% of slot duration
  - partial:       active_time >= 20% of slot duration
  - non_compliant: active_time <  20% of slot duration
  - no_slot:       no timetable slot was assigned
"""
import json
import os
import time
import boto3
from boto3.dynamodb.conditions import Key

TABLE_PREFIX = os.environ.get("TABLE_PREFIX", "labpulse")
dynamodb = boto3.resource("dynamodb")

sessions_table         = dynamodb.Table(f"{TABLE_PREFIX}-Sessions")
behavior_metrics_table = dynamodb.Table(f"{TABLE_PREFIX}-BehaviorMetrics")
timetable_table        = dynamodb.Table(f"{TABLE_PREFIX}-Timetable")


def _compute_compliance(timetable_slot: str, active_time: int) -> str:
    if timetable_slot in ("NONE", "no_slot", None, ""):
        return "no_slot"

    # Get slot duration from timetable
    resp = timetable_table.get_item(Key={"slot_id": timetable_slot})
    slot = resp.get("Item")
    if not slot:
        return "no_slot"

    try:
        sh, sm = map(int, slot["start_time"].split(":"))
        eh, em = map(int, slot["end_time"].split(":"))
        slot_dur = (eh * 60 + em - sh * 60 - sm) * 60  # seconds
    except (KeyError, ValueError):
        return "no_slot"

    if slot_dur <= 0:
        return "no_slot"

    ratio = active_time / slot_dur
    if ratio >= 0.70:
        return "compliant"
    elif ratio >= 0.20:
        return "partial"
    else:
        return "non_compliant"


def lambda_handler(event, context):
    try:
        body       = json.loads(event.get("body", "{}"))
        session_id = body["session_id"]
        logout_time   = body.get("logout_time", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
        total_duration = int(body.get("total_duration", 0))
    except (KeyError, json.JSONDecodeError, ValueError) as e:
        return {"statusCode": 400, "body": json.dumps({"error": str(e)})}

    # Get current session
    resp = sessions_table.get_item(Key={"session_id": session_id})
    session = resp.get("Item")
    if not session:
        return {"statusCode": 404, "body": json.dumps({"error": "Session not found"})}

    # Get total active time from BehaviorMetrics
    metrics = behavior_metrics_table.query(
        IndexName="by_session",
        KeyConditionExpression=Key("session_id").eq(session_id),
    ).get("Items", [])
    total_active = sum(int(m.get("active_time", 0)) for m in metrics)

    timetable_slot = session.get("timetable_slot", "NONE")
    compliance = _compute_compliance(timetable_slot, total_active)

    # Finalize session
    sessions_table.update_item(
        Key={"session_id": session_id},
        UpdateExpression="SET logout_time = :lo, total_duration = :td, compliance_status = :cs",
        ExpressionAttributeValues={
            ":lo": logout_time,
            ":td": total_duration,
            ":cs": compliance,
        },
    )

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"status": "ok", "compliance_status": compliance}),
    }
