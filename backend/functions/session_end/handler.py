"""
Finalize a session and compute compliance status.

Thresholds:
  compliant     — effective_time >= 60% of slot duration
  partial       — effective_time >= 30% of slot duration
  non_compliant — effective_time <  30% of slot duration
  open_access   — no timetable slot assigned (or NONE)
"""
import datetime
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


def _parse_iso_to_seconds(iso_str: str) -> float:
    if not iso_str:
        return 0.0
    try:
        dt = datetime.datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        return dt.timestamp()
    except Exception:
        return 0.0


def _compute_compliance(timetable_slot: str, effective_time: int) -> str:
    if not timetable_slot or timetable_slot in ("NONE", "no_slot", "null", "None", ""):
        return "open_access"

    # Get slot duration from timetable
    try:
        resp = timetable_table.get_item(Key={"slot_id": timetable_slot})
        slot = resp.get("Item")
    except Exception:
        slot = None

    if not slot:
        return "open_access"

    try:
        sh, sm = map(int, slot["start_time"].split(":"))
        eh, em = map(int, slot["end_time"].split(":"))
        slot_dur = (eh * 60 + em - sh * 60 - sm) * 60  # seconds
    except (KeyError, ValueError, AttributeError):
        return "open_access"

    if slot_dur <= 0:
        return "open_access"

    ratio = effective_time / slot_dur
    if ratio >= 0.60:
        return "compliant"
    elif ratio >= 0.30:
        return "partial"
    else:
        return "non_compliant"


def lambda_handler(event, context):
    try:
        body = json.loads(event.get("body", "{}"))
        session_id = body["session_id"]
        logout_time = body.get("logout_time", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
        total_duration = int(body.get("total_duration", 0))
    except (KeyError, json.JSONDecodeError, ValueError) as e:
        return {
            "statusCode": 400,
            "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"error": str(e)}),
        }

    # Get current session
    resp = sessions_table.get_item(Key={"session_id": session_id})
    session = resp.get("Item")
    if not session:
        return {
            "statusCode": 404,
            "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"error": "Session not found"}),
        }

    # Calculate duration from login_time if not supplied or zero
    login_time = session.get("login_time", "")
    if total_duration <= 0 and login_time:
        t_in = _parse_iso_to_seconds(login_time)
        t_out = _parse_iso_to_seconds(logout_time)
        if t_out > t_in:
            total_duration = int(t_out - t_in)

    # Get total active time from BehaviorMetrics
    try:
        metrics = behavior_metrics_table.query(
            IndexName="by_session",
            KeyConditionExpression=Key("session_id").eq(session_id),
        ).get("Items", [])
        total_active = sum(int(m.get("active_time", 0)) for m in metrics)
    except Exception:
        total_active = 0

    # Effective time is the best measure of session presence
    effective_time = max(total_duration, total_active)

    timetable_slot = session.get("timetable_slot", "NONE")
    compliance = _compute_compliance(timetable_slot, effective_time)

    # Finalize session
    sessions_table.update_item(
        Key={"session_id": session_id},
        UpdateExpression="SET logout_time = :lo, total_duration = :td, compliance_status = :cs, active_time = :at",
        ExpressionAttributeValues={
            ":lo": logout_time,
            ":td": total_duration,
            ":cs": compliance,
            ":at": total_active,
        },
    )

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
        "body": json.dumps({
            "status": "ok",
            "compliance_status": compliance,
            "total_duration": total_duration,
            "active_time": total_active,
        }),
    }
