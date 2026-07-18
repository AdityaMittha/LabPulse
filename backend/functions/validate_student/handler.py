"""
validate_student/handler.py — Lambda: validate college credentials, create session, return token.
Walchand Institute of Technology, Solapur — LabPulse Backend
"""
import json
import os
import time
import hashlib
import hmac
import boto3
from boto3.dynamodb.conditions import Key

TABLE_PREFIX = os.environ.get("TABLE_PREFIX", "labpulse")
dynamodb = boto3.resource("dynamodb")

users_table    = dynamodb.Table(f"{TABLE_PREFIX}-Users")
machines_table = dynamodb.Table(f"{TABLE_PREFIX}-Machines")
sessions_table = dynamodb.Table(f"{TABLE_PREFIX}-Sessions")
timetable_table = dynamodb.Table(f"{TABLE_PREFIX}-Timetable")

SECRET = os.environ.get("SESSION_TOKEN_SECRET", "change-me-in-prod")


def _verify_machine_api_key(machine_id: str, api_key: str) -> bool:
    """Check API key hash against Machines table."""
    resp = machines_table.get_item(Key={"machine_id": machine_id})
    machine = resp.get("Item")
    if not machine:
        return False
    stored_hash = machine.get("api_key_hash", "")
    key_hash = "sha256:" + hashlib.sha256(api_key.encode()).hexdigest()
    return hmac.compare_digest(stored_hash, key_hash)


def _make_session_token(session_id: str) -> str:
    """Simple HMAC-based session token (12h expiry embedded)."""
    expires = str(int(time.time()) + 43200)  # 12 hours
    msg = f"{session_id}:{expires}"
    sig = hmac.new(SECRET.encode(), msg.encode(), hashlib.sha256).hexdigest()
    return f"{msg}:{sig}"


def _find_timetable_slot(lab_id: str) -> str:
    """Find the active timetable slot for the given lab at current time."""
    now = time.gmtime()
    day_map = ["MON","TUE","WED","THU","FRI","SAT","SUN"]
    day = day_map[now.tm_wday]
    current_time = f"{now.tm_hour:02d}:{now.tm_min:02d}"

    resp = timetable_table.query(
        IndexName="by_lab",
        KeyConditionExpression=Key("lab_id").eq(lab_id),
    )
    for slot in resp.get("Items", []):
        if slot.get("day_of_week") == day:
            if slot["start_time"] <= current_time < slot["end_time"]:
                return slot["slot_id"]
    return "NONE"


def lambda_handler(event, context):
    # Parse request
    try:
        body = json.loads(event.get("body", "{}"))
        machine_id   = body["machine_id"]
        lab_id       = body["lab_id"]
        college_login = body["college_login"]
        # Password is used only for LDAP validation — NEVER stored
    except (KeyError, json.JSONDecodeError) as e:
        return {"statusCode": 400, "body": json.dumps({"error": f"Bad request: {e}"})}

    # Verify machine API key
    api_key = event.get("headers", {}).get("x-api-key", "")
    if not _verify_machine_api_key(machine_id, api_key):
        return {"statusCode": 403, "body": json.dumps({"error": "Machine not registered or invalid API key."})}

    # Look up student by college_login
    # (In production: also validate password against LDAP/AD before this step)
    resp = users_table.query(
        IndexName="by_college_login",
        KeyConditionExpression=Key("college_login").eq(college_login),
        Limit=1,
    )
    items = resp.get("Items", [])
    if not items:
        return {"statusCode": 401, "body": json.dumps({"error": "College ID not found."})}

    student = items[0]
    student_id = student["student_id"]

    # Create session record
    import uuid
    session_id = str(uuid.uuid4())
    login_time = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    timetable_slot = _find_timetable_slot(lab_id)

    sessions_table.put_item(Item={
        "session_id": session_id,
        "student_id": student_id,
        "machine_id": machine_id,
        "lab_id": lab_id,
        "login_time": login_time,
        "logout_time": None,
        "total_duration": 0,
        "timetable_slot": timetable_slot,
        "compliance_status": "pending",
        "date": login_time[:10],
    })

    # Update machine last_seen_at
    machines_table.update_item(
        Key={"machine_id": machine_id},
        UpdateExpression="SET last_seen_at = :t",
        ExpressionAttributeValues={":t": login_time},
    )

    session_token = _make_session_token(session_id)

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({
            "session_id": session_id,
            "student_id": student_id,
            "session_token": session_token,
            "timetable_slot": timetable_slot,
        }),
    }
