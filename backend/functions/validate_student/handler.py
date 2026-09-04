"""
Validate student via PNR number + password, create a session, return a token.

POST /agent/validate
Body: { pnr_no, password, machine_id, lab_id }
Headers: x-api-key (machine API key)
"""

import hashlib
import hmac
import json
import os
import time
import uuid

import boto3
from boto3.dynamodb.conditions import Key

TABLE_PREFIX = os.environ.get("TABLE_PREFIX", "labpulse")
dynamodb = boto3.resource("dynamodb")

users_table     = dynamodb.Table(f"{TABLE_PREFIX}-Users")
machines_table  = dynamodb.Table(f"{TABLE_PREFIX}-Machines")
sessions_table  = dynamodb.Table(f"{TABLE_PREFIX}-Sessions")
timetable_table = dynamodb.Table(f"{TABLE_PREFIX}-Timetable")

SESSION_SECRET = os.environ.get("SESSION_TOKEN_SECRET", "change-me-in-prod")


# ── Helpers ──────────────────────────────────────────────────────────────────

def _cors(body, code=200):
    return {
        "statusCode": code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": os.environ.get("ALLOWED_ORIGIN", "*"),
        },
        "body": json.dumps(body, default=str),
    }


def _verify_machine_api_key(machine_id: str, api_key: str) -> bool:
    """Check API key hash against Machines table."""
    resp = machines_table.get_item(Key={"machine_id": machine_id})
    machine = resp.get("Item")
    if not machine:
        return False
    stored_hash = machine.get("api_key_hash", "")
    key_hash = "sha256:" + hashlib.sha256(api_key.encode()).hexdigest()
    return hmac.compare_digest(stored_hash, key_hash)


def _hash_password(password: str) -> str:
    """SHA-256 hash for student password storage."""
    return "sha256:" + hashlib.sha256(password.encode()).hexdigest()


def _verify_password(password: str, stored_hash: str) -> bool:
    """Constant-time compare of password against stored hash."""
    candidate = _hash_password(password)
    return hmac.compare_digest(candidate, stored_hash)


def _make_session_token(session_id: str) -> str:
    """HMAC-based session token with 12-hour expiry."""
    expires = str(int(time.time()) + 43200)  # 12 hours
    msg = f"{session_id}:{expires}"
    sig = hmac.new(SESSION_SECRET.encode(), msg.encode(), hashlib.sha256).hexdigest()
    return f"{msg}:{sig}"


def _find_timetable_slot(lab_id: str) -> str:
    """Return the active timetable slot_id for the lab at the current time."""
    now = time.gmtime()
    day_map = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
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


# ── Main handler ─────────────────────────────────────────────────────────────

def lambda_handler(event, context):
    # Parse request body
    try:
        body       = json.loads(event.get("body", "{}"))
        machine_id = body["machine_id"]
        lab_id     = body["lab_id"]

        # Accept either pnr_no (new) or college_login (legacy fallback)
        pnr_no        = body.get("pnr_no", "").strip()
        college_login = body.get("college_login", "").strip()
        password      = body.get("password", "")

        if not pnr_no and not college_login:
            return _cors({"error": "pnr_no or college_login is required."}, 400)
    except (KeyError, json.JSONDecodeError) as e:
        return _cors({"error": f"Bad request: {e}"}, 400)

    # Verify machine API key (prevents rogue machines)
    api_key = event.get("headers", {}).get("x-api-key", "")
    if not _verify_machine_api_key(machine_id, api_key):
        return _cors({"error": "Machine not registered or invalid API key."}, 403)

    # Look up student by PNR (preferred) or college_login (legacy)
    student = None
    if pnr_no:
        resp  = users_table.query(
            IndexName="by_pnr",
            KeyConditionExpression=Key("pnr_no").eq(pnr_no),
            Limit=1,
        )
        items = resp.get("Items", [])
        if items:
            student = items[0]

    if student is None and college_login:
        resp  = users_table.query(
            IndexName="by_college_login",
            KeyConditionExpression=Key("college_login").eq(college_login),
            Limit=1,
        )
        items = resp.get("Items", [])
        if items:
            student = items[0]

    if student is None:
        return _cors({"error": "PNR number not found. Contact lab admin."}, 401)

    # Verify password if a hash is stored (skip check for records without hash — legacy)
    stored_hash = student.get("password_hash", "")
    if stored_hash and not _verify_password(password, stored_hash):
        return _cors({"error": "Incorrect password."}, 401)

    student_id = student["student_id"]
    student_name = student.get("name", "")

    # Create session record
    session_id     = str(uuid.uuid4())
    login_time     = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    timetable_slot = _find_timetable_slot(lab_id)

    sessions_table.put_item(Item={
        "session_id":        session_id,
        "student_id":        student_id,
        "student_name":      student_name,
        "machine_id":        machine_id,
        "lab_id":            lab_id,
        "login_time":        login_time,
        "logout_time":       None,
        "total_duration":    0,
        "timetable_slot":    timetable_slot,
        "compliance_status": "pending",
        "date":              login_time[:10],
        "course_code":       "",
    })

    # Update machine last_seen_at
    machines_table.update_item(
        Key={"machine_id": machine_id},
        UpdateExpression="SET last_seen_at = :t",
        ExpressionAttributeValues={":t": login_time},
    )

    session_token = _make_session_token(session_id)

    return _cors({
        "session_id":     session_id,
        "student_id":     student_id,
        "student_name":   student_name,
        "session_token":  session_token,
        "timetable_slot": timetable_slot,
        "login_time":     login_time,
    })
