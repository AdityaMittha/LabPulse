"""Admin CRUD for machines, students, and timetable slots."""
import json
import os
import time
import hashlib
import secrets
import uuid
import boto3
from boto3.dynamodb.conditions import Key, Attr

TABLE_PREFIX = os.environ.get("TABLE_PREFIX", "labpulse")
dynamodb = boto3.resource("dynamodb")

# Tables
machines_table       = dynamodb.Table(f"{TABLE_PREFIX}-Machines")
students_table       = dynamodb.Table(f"{TABLE_PREFIX}-Users")
timetable_table      = dynamodb.Table(f"{TABLE_PREFIX}-Timetable")
labs_table           = dynamodb.Table(f"{TABLE_PREFIX}-Labs")
departments_table    = dynamodb.Table(f"{TABLE_PREFIX}-Departments")
sessions_table       = dynamodb.Table(f"{TABLE_PREFIX}-Sessions")
app_usage_table      = dynamodb.Table(f"{TABLE_PREFIX}-AppUsage")
behavior_table       = dynamodb.Table(f"{TABLE_PREFIX}-BehaviorMetrics")
hourly_reports_table = dynamodb.Table(f"{TABLE_PREFIX}-HourlyReports")


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


def _cascade_delete_sessions(session_ids):
    """Utility to delete sessions and all associated app usage, behavior metrics, and hourly reports."""
    for sess_id in session_ids:
        # 1. Delete AppUsage
        try:
            resp = app_usage_table.query(
                IndexName="by_session",
                KeyConditionExpression=Key("session_id").eq(sess_id)
            )
            for app in resp.get("Items", []):
                app_usage_table.delete_item(Key={"app_usage_id": app["app_usage_id"]})
        except Exception as e:
            print(f"Error deleting AppUsage for session {sess_id}: {e}")
        
        # 2. Delete BehaviorMetrics
        try:
            resp = behavior_table.query(
                IndexName="by_session",
                KeyConditionExpression=Key("session_id").eq(sess_id)
            )
            for metric in resp.get("Items", []):
                behavior_table.delete_item(Key={"metric_id": metric["metric_id"]})
        except Exception as e:
            print(f"Error deleting BehaviorMetrics for session {sess_id}: {e}")
            
        # 3. Delete from Sessions table
        try:
            sessions_table.delete_item(Key={"session_id": sess_id})
        except Exception as e:
            print(f"Error deleting session {sess_id} from Sessions: {e}")


def _delete_student_cascade(student_id):
    """Cascade delete all student data: sessions, apps, metrics, hourly reports, and user profile."""
    # 1. Find all session IDs for student
    try:
        sessions_resp = sessions_table.query(
            IndexName="by_student",
            KeyConditionExpression=Key("student_id").eq(student_id)
        )
        session_ids = [s["session_id"] for s in sessions_resp.get("Items", [])]
        
        # 2. Delete all sessions and related metrics
        _cascade_delete_sessions(session_ids)
    except Exception as e:
        print(f"Error cascading student sessions for {student_id}: {e}")
    
    # 3. Delete HourlyReports for student
    try:
        reports_resp = hourly_reports_table.query(
            IndexName="by_student_date",
            KeyConditionExpression=Key("student_id").eq(student_id)
        )
        for report in reports_resp.get("Items", []):
            hourly_reports_table.delete_item(Key={"report_id": report["report_id"]})
    except Exception as e:
        print(f"Error deleting HourlyReports for student {student_id}: {e}")
        
    # 4. Delete the student profile
    students_table.delete_item(Key={"student_id": student_id})


def _delete_machine_cascade(machine_id):
    """Cascade delete all machine data: sessions, apps, metrics, hourly reports, and machine registration."""
    # 1. Find all session IDs for machine
    try:
        sessions_resp = sessions_table.query(
            IndexName="by_machine",
            KeyConditionExpression=Key("machine_id").eq(machine_id)
        )
        session_ids = [s["session_id"] for s in sessions_resp.get("Items", [])]
        
        # 2. Delete all sessions and related metrics
        _cascade_delete_sessions(session_ids)
    except Exception as e:
        print(f"Error cascading machine sessions for {machine_id}: {e}")
    
    # 3. Delete HourlyReports for machine
    try:
        reports_resp = hourly_reports_table.scan(
            FilterExpression=Attr("machine_id").eq(machine_id)
        )
        for report in reports_resp.get("Items", []):
            hourly_reports_table.delete_item(Key={"report_id": report["report_id"]})
    except Exception as e:
        print(f"Error deleting HourlyReports for machine {machine_id}: {e}")
        
    # 4. Delete the machine profile
    machines_table.delete_item(Key={"machine_id": machine_id})


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
    elif "/labs" in path:
        return _handle_labs(method, body, event)
    elif "/departments" in path:
        return _handle_departments(method, body, event)
    else:
        return _cors({"error": "Unknown entity"}, 404)


# â”€â”€ Machines â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
        return _cors({"machine_id": machine_id, "api_key": raw_key, "message": "Save this API key â€” it won't be shown again."}, 201)

    if method == "DELETE":
        machine_id = qs.get("machine_id") or body.get("machine_id")
        if not machine_id:
            return _cors({"error": "machine_id required"}, 400)
        _delete_machine_cascade(machine_id)
        return _cors({"status": "deleted"})

    return _cors({"error": "Method not allowed"}, 405)


# â”€â”€ Students â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _handle_students(method, body, event):
    qs = event.get("queryStringParameters") or {}
    if method == "GET":
        resp = students_table.scan()
        return _cors({"students": resp.get("Items", [])})

    if method == "POST":
        student_id    = body.get("student_id")
        name          = body.get("name")
        college_login = body.get("college_login")
        pnr_no        = body.get("pnr_no", "").strip()
        password      = body.get("password", "").strip()

        if not all([student_id, name, college_login]):
            return _cors({"error": "student_id, name, college_login required"}, 400)

        item = {
            "student_id":    student_id,
            "name":          name,
            "department":    body.get("department", ""),
            "year":          body.get("year", ""),
            "college_login": college_login,
            "role":          "student",
            "created_at":    time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }

        # PNR number (unique enrollment ID printed on college ID card)
        if pnr_no:
            item["pnr_no"] = pnr_no

        # Store SHA-256 password hash — NEVER the plaintext password
        if password:
            item["password_hash"] = "sha256:" + hashlib.sha256(password.encode()).hexdigest()

        students_table.put_item(Item=item)
        return _cors({"student_id": student_id, "status": "created"}, 201)

    if method == "DELETE":
        student_id = qs.get("student_id") or body.get("student_id")
        if not student_id:
            return _cors({"error": "student_id required"}, 400)
        _delete_student_cascade(student_id)
        return _cors({"status": "deleted"})

    return _cors({"error": "Method not allowed"}, 405)


# ── Timetable ───────────────────────────────────────────────────────────────────

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


# ── Labs ───────────────────────────────────────────────────────────────────

def _handle_labs(method, body, event):
    qs = event.get("queryStringParameters") or {}
    if method == "GET":
        resp = labs_table.scan()
        return _cors({"labs": resp.get("Items", [])})

    if method == "POST":
        lab_id = body.get("lab_id")
        name   = body.get("name")
        if not lab_id or not name:
            return _cors({"error": "lab_id and name required"}, 400)
        labs_table.put_item(Item={
            "lab_id":     lab_id,
            "name":       name,
            "building":   body.get("building", ""),
            "floor":      body.get("floor", ""),
            "department": body.get("department", ""),
            "capacity":   int(body.get("capacity", 30)),
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        })
        return _cors({"lab_id": lab_id, "status": "created"}, 201)

    if method == "DELETE":
        lab_id = qs.get("lab_id") or body.get("lab_id")
        if not lab_id:
            return _cors({"error": "lab_id required"}, 400)
        labs_table.delete_item(Key={"lab_id": lab_id})
        return _cors({"status": "deleted"})

    return _cors({"error": "Method not allowed"}, 405)


# ── Departments ─────────────────────────────────────────────────────────────

def _handle_departments(method, body, event):
    qs = event.get("queryStringParameters") or {}
    if method == "GET":
        resp = departments_table.scan()
        items = resp.get("Items", [])
        items.sort(key=lambda d: d.get("department_id", ""))
        return _cors({"departments": items})

    if method == "POST":
        dept_id  = (body.get("department_id") or body.get("code") or "").strip().upper()
        name     = (body.get("name") or "").strip()
        code     = (body.get("code") or dept_id).strip().upper()
        building = (body.get("building") or "").strip()
        hod_name = (body.get("hod_name") or "").strip()

        if not dept_id or not name:
            return _cors({"error": "department_id and name required"}, 400)

        item = {
            "department_id": dept_id,
            "name":          name,
            "code":          code,
            "building":      building,
            "hod_name":      hod_name,
            "created_at":    time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        departments_table.put_item(Item=item)
        return _cors({"department_id": dept_id, "status": "created"}, 201)

    if method == "DELETE":
        dept_id = qs.get("department_id") or body.get("department_id")
        if not dept_id:
            return _cors({"error": "department_id required"}, 400)
        departments_table.delete_item(Key={"department_id": dept_id})
        return _cors({"status": "deleted"})

    return _cors({"error": "Method not allowed"}, 405)

