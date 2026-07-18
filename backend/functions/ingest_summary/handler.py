"""
ingest_summary/handler.py — Lambda: receive hourly summary, write to DynamoDB.
Walchand Institute of Technology, Solapur — LabPulse Backend

Privacy enforcement: rejects any payload containing disallowed fields.
"""
import json
import os
import time
import uuid
import boto3

TABLE_PREFIX = os.environ.get("TABLE_PREFIX", "labpulse")
dynamodb = boto3.resource("dynamodb")

hourly_reports_table   = dynamodb.Table(f"{TABLE_PREFIX}-HourlyReports")
app_usage_table        = dynamodb.Table(f"{TABLE_PREFIX}-AppUsage")
behavior_metrics_table = dynamodb.Table(f"{TABLE_PREFIX}-BehaviorMetrics")
machines_table         = dynamodb.Table(f"{TABLE_PREFIX}-Machines")

DISALLOWED_FIELDS = {
    "password","keystrokes","key_values","raw_keys",
    "screenshot","clipboard","window_title","url",
}

REQUIRED_SUMMARY_FIELDS = {"report_id","session_id","student_id","machine_id","lab_id","hour_start","hour_end","date","summary"}


def _check_privacy(obj, path=""):
    """Recursively ensure no disallowed fields are present."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k.lower() in DISALLOWED_FIELDS:
                raise ValueError(f"PRIVACY VIOLATION: disallowed field '{path}.{k}' in payload")
            _check_privacy(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            _check_privacy(item, f"{path}[{i}]")


def lambda_handler(event, context):
    try:
        body = json.loads(event.get("body", "{}"))
    except json.JSONDecodeError as e:
        return {"statusCode": 400, "body": json.dumps({"error": f"Invalid JSON: {e}"})}

    # Schema check
    missing = REQUIRED_SUMMARY_FIELDS - set(body.keys())
    if missing:
        return {"statusCode": 400, "body": json.dumps({"error": f"Missing fields: {missing}"})}

    # Privacy enforcement
    try:
        _check_privacy(body)
    except ValueError as e:
        return {"statusCode": 422, "body": json.dumps({"error": str(e)})}

    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    session_id = body["session_id"]
    report_id  = body["report_id"]  # idempotency key: session_id#hour_start

    # Write HourlyReport (idempotent — put_item overwrites on same report_id)
    hourly_reports_table.put_item(Item={
        "report_id":    report_id,
        "student_id":   body["student_id"],
        "machine_id":   body["machine_id"],
        "lab_id":       body["lab_id"],
        "hour_start":   body["hour_start"],
        "hour_end":     body["hour_end"],
        "date":         body["date"],
        "timetable_slot": body.get("timetable_slot", "NONE"),
        "summary_json": json.dumps(body["summary"]),
        "ingested_at":  now,
    })

    # Write AppUsage records
    with app_usage_table.batch_writer() as batch:
        for app in body["summary"].get("app_usage", []):
            batch.put_item(Item={
                "app_usage_id":     str(uuid.uuid4()),
                "session_id":       session_id,
                "app_name":         app["app_name"],
                "active_duration":  app["active_duration"],
                "open_count":       app.get("open_count", 0),
            })

    # Write BehaviorMetrics
    behavior = body["summary"].get("behavior", {})
    behavior_metrics_table.put_item(Item={
        "metric_id":          f"{session_id}#{body['hour_start']}",
        "session_id":         session_id,
        "hour_start":         body["hour_start"],
        "keyboard_count":     behavior.get("keyboard_count", 0),
        "mouse_click_count":  behavior.get("mouse_click_count", 0),
        "mouse_move_count":   behavior.get("mouse_move_count", 0),
        "idle_time":          behavior.get("idle_time", 0),
        "active_time":        behavior.get("active_time", 0),
    })

    # Update machine last_seen_at
    machines_table.update_item(
        Key={"machine_id": body["machine_id"]},
        UpdateExpression="SET last_seen_at = :t",
        ExpressionAttributeValues={":t": now},
    )

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"status": "ok", "report_id": report_id}),
    }
