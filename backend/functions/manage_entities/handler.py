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
browser_activity_table = dynamodb.Table(f"{TABLE_PREFIX}-BrowserActivity")


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
    """Utility to delete sessions and all associated app usage, behavior metrics, browser activity, and hourly reports."""
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

        # 3. Delete BrowserActivity
        try:
            resp = browser_activity_table.query(
                IndexName="by_session",
                KeyConditionExpression=Key("session_id").eq(sess_id)
            )
            for act in resp.get("Items", []):
                browser_activity_table.delete_item(Key={"activity_id": act["activity_id"]})
        except Exception as e:
            print(f"Error deleting BrowserActivity for session {sess_id}: {e}")
            
        # 4. Delete from Sessions table
        try:
            sessions_table.delete_item(Key={"session_id": sess_id})
        except Exception as e:
            print(f"Error deleting session {sess_id} from Sessions: {e}")


def _delete_student_cascade(student_id):
    """Cascade delete all student data: sessions, apps, metrics, hourly reports, browser activity, and user profile."""
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

    # 4. Delete BrowserActivity for student
    try:
        ba_resp = browser_activity_table.query(
            IndexName="by_student_date",
            KeyConditionExpression=Key("student_id").eq(student_id)
        )
        for act in ba_resp.get("Items", []):
            browser_activity_table.delete_item(Key={"activity_id": act["activity_id"]})
    except Exception as e:
        print(f"Error deleting BrowserActivity for student {student_id}: {e}")
        
    # 5. Delete the student profile
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


def _delete_lab_cascade(lab_id):
    """Cascade delete lab: timetable slots and lab registration."""
    # 1. Delete timetable slots for lab
    try:
        resp = timetable_table.query(
            IndexName="by_lab",
            KeyConditionExpression=Key("lab_id").eq(lab_id)
        )
        for s in resp.get("Items", []):
            timetable_table.delete_item(Key={"slot_id": s["slot_id"]})
    except Exception as e:
        print(f"Error deleting timetable slots for lab {lab_id}: {e}")

    # 2. Delete lab item
    labs_table.delete_item(Key={"lab_id": lab_id})


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

    if method in ("POST", "PUT"):
        machine_id     = (body.get("machine_id") or qs.get("machine_id") or "").strip()
        lab_id         = (body.get("lab_id") or "").strip()
        hostname       = (body.get("hostname") or "").strip()
        status         = (body.get("status") or "active").strip()
        regenerate_key = bool(body.get("regenerate_key", False))
        is_edit        = method == "PUT" or bool(body.get("is_edit", False))

        if not machine_id:
            return _cors({"error": "machine_id required"}, 400)

        existing = None
        try:
            resp = machines_table.get_item(Key={"machine_id": machine_id})
            existing = resp.get("Item")
        except Exception as e:
            print(f"Error fetching machine {machine_id}: {e}")

        if existing and is_edit:
            update_lab = lab_id or existing.get("lab_id")
            update_host = hostname or existing.get("hostname")
            update_status = status or existing.get("status", "active")
            
            raw_key = None
            key_hash = existing.get("api_key_hash")
            if regenerate_key:
                raw_key, key_hash = _generate_api_key()

            item = {
                **existing,
                "lab_id":       update_lab,
                "hostname":     update_host,
                "status":       update_status,
                "api_key_hash": key_hash,
                "updated_at":   time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            }
            machines_table.put_item(Item=item)
            res = {"machine_id": machine_id, "status": "updated"}
            if raw_key:
                res["api_key"] = raw_key
                res["message"] = "New API key generated."
            return _cors(res, 200)

        if not all([machine_id, lab_id, hostname]):
            return _cors({"error": "machine_id, lab_id, hostname required"}, 400)

        raw_key, key_hash = _generate_api_key()
        machines_table.put_item(Item={
            "machine_id":   machine_id,
            "lab_id":       lab_id,
            "hostname":     hostname,
            "status":       status or "active",
            "api_key_hash": key_hash,
            "last_seen_at": None,
            "created_at":   time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        })
        return _cors({"machine_id": machine_id, "api_key": raw_key, "message": "Save this API key — it won't be shown again."}, 201)

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
        items = resp.get("Items", [])
        for it in items:
            val = it.get("student_id") or it.get("pnr_no") or ""
            if val:
                it["student_id"] = val
                it["pnr_no"] = val
        return _cors({"students": items})

    if method in ("POST", "PUT"):
        student_id    = (body.get("student_id") or body.get("pnr_no") or qs.get("student_id") or qs.get("pnr_no") or "").strip()
        pnr_no        = student_id
        name          = (body.get("name") or "").strip()
        department    = (body.get("department") or "").strip()
        year          = (body.get("year") or "").strip()
        roll_no       = (body.get("roll_no") or "").strip()
        batch         = (body.get("batch") or body.get("student_group") or "").strip().upper()
        college_login = (body.get("college_login") or "").strip()
        password      = (body.get("password") or "").strip()
        is_edit       = method == "PUT" or bool(body.get("is_edit", False))

        if not student_id:
            return _cors({"error": "PNR No. (Student ID) is compulsory"}, 400)

        existing = None
        try:
            resp = students_table.get_item(Key={"student_id": student_id})
            existing = resp.get("Item")
        except Exception as e:
            print(f"Error fetching student {student_id}: {e}")

        if existing and is_edit:
            item = {
                **existing,
                "student_id":    student_id,
                "pnr_no":        student_id,
                "name":          name or existing.get("name"),
                "roll_no":       roll_no if "roll_no" in body else existing.get("roll_no", ""),
                "batch":         batch if ("batch" in body or "student_group" in body) else existing.get("batch", ""),
                "department":    department or existing.get("department"),
                "year":          year or existing.get("year"),
                "college_login": college_login if "college_login" in body else existing.get("college_login", ""),
                "updated_at":    time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            }
            if password:
                item["password_hash"] = "sha256:" + hashlib.sha256(password.encode()).hexdigest()
            students_table.put_item(Item=item)
            return _cors({"student_id": student_id, "pnr_no": student_id, "roll_no": item.get("roll_no", ""), "batch": item.get("batch", ""), "status": "updated"}, 200)

        if not password:
            return _cors({"error": "Password is compulsory for PC login"}, 400)
        if not name:
            return _cors({"error": "Student name is compulsory"}, 400)

        item = {
            "student_id":    student_id,
            "pnr_no":        student_id,  # student_id and pnr_no are identical
            "name":          name,
            "roll_no":       roll_no,
            "batch":         batch,
            "department":    department,
            "year":          year,
            "college_login": college_login or "",
            "role":          "student",
            "password_hash": "sha256:" + hashlib.sha256(password.encode()).hexdigest(),
            "created_at":    time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }

        students_table.put_item(Item=item)
        return _cors({"student_id": student_id, "pnr_no": student_id, "roll_no": roll_no, "batch": batch, "status": "created"}, 201)

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
        lab_id        = (body.get("lab_id") or "").strip()
        day_of_week   = (body.get("day_of_week") or "").strip()
        start_time    = (body.get("start_time") or "").strip()
        end_time      = (body.get("end_time") or "").strip()
        year          = (body.get("year") or "").strip().upper() or "BE"
        course_code   = (body.get("course_code") or "").strip()
        faculty_name  = (body.get("faculty_name") or "").strip()
        student_group = (body.get("student_group") or "").strip()
        expected_count = int(body.get("expected_count") or 25)

        if not all([lab_id, day_of_week, start_time, end_time, course_code, faculty_name, student_group]):
            return _cors({"error": "All timetable slot fields (lab_id, day_of_week, start_time, end_time, course_code, faculty_name, student_group) are compulsory"}, 400)

        slot_id = f"{lab_id}#{day_of_week}#{start_time}"
        timetable_table.put_item(Item={
            "slot_id":       slot_id,
            "lab_id":        lab_id,
            "day_of_week":   day_of_week,
            "start_time":    start_time,
            "end_time":      end_time,
            "year":          year,
            "course_code":   course_code,
            "faculty_name":  faculty_name,
            "student_group": student_group,
            "expected_count": expected_count,
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

    if method in ("POST", "PUT"):
        lab_id     = (body.get("lab_id") or qs.get("lab_id") or "").strip().upper()
        name       = (body.get("name") or "").strip()
        department = (body.get("department") or "").strip()
        building   = (body.get("building") or "").strip()
        floor      = (body.get("floor") or "").strip()
        capacity   = int(body.get("capacity") or 30)
        is_edit    = method == "PUT" or bool(body.get("is_edit", False))

        if not lab_id:
            return _cors({"error": "lab_id is compulsory"}, 400)

        existing = None
        try:
            resp = labs_table.get_item(Key={"lab_id": lab_id})
            existing = resp.get("Item")
        except Exception as e:
            print(f"Error fetching lab {lab_id}: {e}")

        if existing and is_edit:
            item = {
                **existing,
                "name":       name or existing.get("name"),
                "department": department or existing.get("department"),
                "building":   building or existing.get("building"),
                "floor":      floor or existing.get("floor"),
                "capacity":   capacity or existing.get("capacity", 30),
                "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            }
            labs_table.put_item(Item=item)
            return _cors({"lab_id": lab_id, "status": "updated"}, 200)

        if not name or not department:
            return _cors({"error": "lab_id, name, and department are compulsory"}, 400)

        labs_table.put_item(Item={
            "lab_id":     lab_id,
            "name":       name,
            "building":   building,
            "floor":      floor,
            "department": department,
            "capacity":   capacity,
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        })
        return _cors({"lab_id": lab_id, "status": "created"}, 201)

    if method == "DELETE":
        lab_id = qs.get("lab_id") or body.get("lab_id")
        if not lab_id:
            return _cors({"error": "lab_id required"}, 400)
        _delete_lab_cascade(lab_id)
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

