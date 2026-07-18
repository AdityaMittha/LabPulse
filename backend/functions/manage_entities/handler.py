"""
manage_entities/handler.py — Lambda: Admin CRUD for Machines, Students, Timetable.
Only accessible to Cognito 'admin' group users.
Walchand Institute of Technology, Solapur — LabPulse Backend
"""
import json
import os
import time
import hashlib
import secrets
import uuid
import boto3
from boto3.dynamodb.conditions import Key

TABLE_PREFIX = os.environ.get("TABLE_PREFIX", "labpulse")
dynamodb = boto3.resource("dynamodb")

machines_table  = dynamodb.Table(f"{TABLE_PREFIX}-Machines")
students_table  = dynamodb.Table(f"{TABLE_PREFIX}-Users")
timetable_table = dynamodb.Table(f"{TABLE_PREFIX}-Timetable")


def _cors(body, code=200):
    return {
        "statusCode": code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": os.environ.get("ALLOWED_ORIGIN", "*"),
        },
        "body": json.dumps(body, default=str),
    }


def _generate_api_key() -> tuple[str, str]:
    """Generate a raw API key and its SHA-256 hash. Returns (raw_key, hash)."""
    raw = "lp_" + secrets.token_urlsafe(24)
    key_hash = "sha256:" + hashlib.sha256(raw.encode()).hexdigest()
    return raw, key_hash


def lambda_handler(event, context):
    method = event.get("requestContext", {}).get("http", {}).get("method", "GET")
    path   = event.get("rawPath", "")
    body   = {}
    if event.get("body"):
        try:
            body = json.loads(event["body"])
        except json.JSONDecodeError:
            return _cors({"error": "Invalid JSON"}, 400)

    # Route to the right handler
    if "/machines" in path:
        return _handle_machines(method, body, event)
    elif "/students" in path:
        return _handle_students(method, body, event)
    elif "/timetable" in path:
        return _handle_timetable(method, body, event)
    else:
        return _cors({"error": "Unknown entity"}, 404)


# ── Machines ─────────────────────────────────────────────────────────────────

def _handle_machines(method, body, event):
    qs = event.get("queryStringParameters") or {}
    if method == "GET":
        lab_id = qs.get("lab_id")
        if lab_id:
            resp = machines_table.query(
                IndexName="by_lab",
                KeyConditionExpression=Key("lab_id").eq(lab_id),
            )
        else:
            resp = machines_table.scan()
        return _cors({"machines": resp.get("Items", [])})

    if method == "POST":
        machine_id = body.get("machine_id")
        lab_id     = body.get("lab_id")
        hostname   = body.get("hostname")
        if not all([machine_id, lab_id, hostname]):
            return _cors({"error": "machine_id, lab_id, hostname required"}, 400)

        raw_key, key_hash = _generate_api_key()
        machines_table.put_item(Item={
            "machine_id":   machine_id,
            "lab_id":       lab_id,
            "hostname":     hostname,
            "status":       "active",
            "api_key_hash": key_hash,
            "last_seen_at": None,
            "created_at":   time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        })
        # Return raw key ONCE — never stored
        return _cors({"machine_id": machine_id, "api_key": raw_key, "message": "Save this API key — it won't be shown again."}, 201)

    if method == "DELETE":
        machine_id = qs.get("machine_id") or body.get("machine_id")
        if not machine_id:
            return _cors({"error": "machine_id required"}, 400)
        machines_table.delete_item(Key={"machine_id": machine_id})
        return _cors({"status": "deleted"})

    return _cors({"error": "Method not allowed"}, 405)


# ── Students ──────────────────────────────────────────────────────────────────

def _handle_students(method, body, event):
    qs = event.get("queryStringParameters") or {}
    if method == "GET":
        resp = students_table.scan()
        return _cors({"students": resp.get("Items", [])})

    if method == "POST":
        student_id    = body.get("student_id")
        name          = body.get("name")
        college_login = body.get("college_login")
        if not all([student_id, name, college_login]):
            return _cors({"error": "student_id, name, college_login required"}, 400)
        students_table.put_item(Item={
            "student_id":    student_id,
            "name":          name,
            "department":    body.get("department", ""),
            "year":          body.get("year", ""),
            "college_login": college_login,
            "role":          "student",
            "created_at":    time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        })
        return _cors({"student_id": student_id, "status": "created"}, 201)

    if method == "DELETE":
        student_id = qs.get("student_id") or body.get("student_id")
        students_table.delete_item(Key={"student_id": student_id})
        return _cors({"status": "deleted"})

    return _cors({"error": "Method not allowed"}, 405)


# ── Timetable ─────────────────────────────────────────────────────────────────

def _handle_timetable(method, body, event):
    qs = event.get("queryStringParameters") or {}
    if method == "GET":
        lab_id = qs.get("lab_id")
        if lab_id:
            resp = timetable_table.query(
                IndexName="by_lab",
                KeyConditionExpression=Key("lab_id").eq(lab_id),
            )
        else:
            resp = timetable_table.scan()
        return _cors({"slots": resp.get("Items", [])})

    if method == "POST":
        slot_id = f"{body.get('lab_id')}#{body.get('day_of_week')}#{body.get('start_time')}"
        timetable_table.put_item(Item={
            "slot_id":       slot_id,
            "lab_id":        body.get("lab_id"),
            "day_of_week":   body.get("day_of_week"),
            "start_time":    body.get("start_time"),
            "end_time":      body.get("end_time"),
            "course_code":   body.get("course_code"),
            "faculty_name":  body.get("faculty_name"),
            "student_group": body.get("student_group"),
            "expected_count": int(body.get("expected_count", 25)),
        })
        return _cors({"slot_id": slot_id, "status": "created"}, 201)

    if method == "DELETE":
        slot_id = qs.get("slot_id") or body.get("slot_id")
        timetable_table.delete_item(Key={"slot_id": slot_id})
        return _cors({"status": "deleted"})

    return _cors({"error": "Method not allowed"}, 405)
