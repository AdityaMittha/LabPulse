"""
get_analytics/handler.py — Lambda: query analytics data for the dashboard.
Walchand Institute of Technology, Solapur — LabPulse Backend

Supports filters: lab_id, machine_id, student_id, date, date_from, date_to, slot
"""
import json
import os
import boto3
from boto3.dynamodb.conditions import Key, Attr

TABLE_PREFIX = os.environ.get("TABLE_PREFIX", "labpulse")
dynamodb = boto3.resource("dynamodb")

sessions_table      = dynamodb.Table(f"{TABLE_PREFIX}-Sessions")
hourly_reports_table = dynamodb.Table(f"{TABLE_PREFIX}-HourlyReports")
app_usage_table     = dynamodb.Table(f"{TABLE_PREFIX}-AppUsage")


def _cors(body, code=200):
    return {
        "statusCode": code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": os.environ.get("ALLOWED_ORIGIN", "*"),
        },
        "body": json.dumps(body, default=str),
    }


def lambda_handler(event, context):
    qs = event.get("queryStringParameters") or {}
    path = event.get("rawPath", "")

    if "/compliance" in path:
        return _get_compliance(qs)
    else:
        return _get_usage(qs)


def _get_usage(qs: dict):
    """Return sessions matching filters."""
    lab_id     = qs.get("lab_id")
    machine_id = qs.get("machine_id")
    student_id = qs.get("student_id")
    date       = qs.get("date")
    date_from  = qs.get("date_from")
    date_to    = qs.get("date_to")
    limit      = int(qs.get("limit", 100))

    items = []
    if student_id:
        resp = sessions_table.query(
            IndexName="by_student",
            KeyConditionExpression=Key("student_id").eq(student_id),
            Limit=limit,
            ScanIndexForward=False,
        )
        items = resp.get("Items", [])
    elif machine_id:
        resp = sessions_table.query(
            IndexName="by_machine",
            KeyConditionExpression=Key("machine_id").eq(machine_id),
            Limit=limit,
            ScanIndexForward=False,
        )
        items = resp.get("Items", [])
    elif lab_id and date:
        resp = sessions_table.query(
            IndexName="by_lab_date",
            KeyConditionExpression=Key("lab_id").eq(lab_id) & Key("date").eq(date),
            Limit=limit,
        )
        items = resp.get("Items", [])
    else:
        # Scan with filter (use sparingly — add more GSIs for production)
        filter_expr = None
        if date:
            filter_expr = Attr("date").eq(date)
        resp = sessions_table.scan(FilterExpression=filter_expr, Limit=limit) if filter_expr else sessions_table.scan(Limit=limit)
        items = resp.get("Items", [])

    # Post-filter by date range
    if date_from or date_to:
        items = [i for i in items if
                 (not date_from or i.get("date","") >= date_from) and
                 (not date_to   or i.get("date","") <= date_to)]

    return _cors({"sessions": items, "count": len(items)})


def _get_compliance(qs: dict):
    """Return compliance summary for a lab + date."""
    lab_id = qs.get("lab_id")
    date   = qs.get("date")
    slot   = qs.get("slot")

    if not lab_id or not date:
        return _cors({"error": "lab_id and date required"}, 400)

    resp = sessions_table.query(
        IndexName="by_lab_date",
        KeyConditionExpression=Key("lab_id").eq(lab_id) & Key("date").eq(date),
    )
    items = resp.get("Items", [])
    if slot:
        items = [i for i in items if i.get("timetable_slot") == slot]

    compliant     = sum(1 for i in items if i.get("compliance_status") == "compliant")
    partial       = sum(1 for i in items if i.get("compliance_status") == "partial")
    non_compliant = sum(1 for i in items if i.get("compliance_status") == "non_compliant")

    return _cors({
        "lab_id": lab_id, "date": date, "slot": slot,
        "total": len(items),
        "compliant": compliant, "partial": partial, "non_compliant": non_compliant,
        "compliance_pct": round((compliant / len(items)) * 100) if items else 0,
        "sessions": items,
    })
