"""
ingest_summary/handler.py — Lambda: receive hourly summary, write to DynamoDB.
Walchand Institute of Technology, Solapur — LabPulse Backend

Accepts app usage, behavior metrics, and browser activity data from the agent.
"""
import json
import os
import time
import uuid
import boto3

TABLE_PREFIX = os.environ.get("TABLE_PREFIX", "labpulse")
dynamodb = boto3.resource("dynamodb")

hourly_reports_table    = dynamodb.Table(f"{TABLE_PREFIX}-HourlyReports")
app_usage_table         = dynamodb.Table(f"{TABLE_PREFIX}-AppUsage")
behavior_metrics_table  = dynamodb.Table(f"{TABLE_PREFIX}-BehaviorMetrics")
machines_table          = dynamodb.Table(f"{TABLE_PREFIX}-Machines")
browser_activity_table  = dynamodb.Table(f"{TABLE_PREFIX}-BrowserActivity")

REQUIRED_SUMMARY_FIELDS = {"report_id","session_id","student_id","machine_id","lab_id","hour_start","hour_end","date","summary"}


def lambda_handler(event, context):
    try:
        body = json.loads(event.get("body", "{}"))
    except json.JSONDecodeError as e:
        return {"statusCode": 400, "body": json.dumps({"error": f"Invalid JSON: {e}"})}

    # Schema check
    missing = REQUIRED_SUMMARY_FIELDS - set(body.keys())
    if missing:
        return {"statusCode": 400, "body": json.dumps({"error": f"Missing fields: {missing}"})}

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

    # Write BrowserActivity (if present)
    browser = body["summary"].get("browser_activity", {})
    sites = browser.get("sites", [])
    page_log = browser.get("page_log", [])
    if sites or page_log:
        browser_activity_table.put_item(Item={
            "activity_id":  f"{session_id}#{body['hour_start']}",
            "session_id":   session_id,
            "student_id":   body["student_id"],
            "lab_id":       body["lab_id"],
            "date":         body["date"],
            "hour_start":   body["hour_start"],
            "sites_json":   json.dumps(sites),
            "page_log_json": json.dumps(page_log),
            "ingested_at":  now,
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
