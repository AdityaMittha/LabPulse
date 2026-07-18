"""
seed_data.py — Seed WIT Solapur lab data into DynamoDB for LabPulse.
Run after `sam deploy` to populate tables with initial data.

Usage:
    python seed_data.py --profile default --region ap-south-1 --prefix labpulse
"""
import argparse
import hashlib
import json
import time
import boto3

parser = argparse.ArgumentParser()
parser.add_argument("--profile", default="default")
parser.add_argument("--region",  default="ap-south-1")
parser.add_argument("--prefix",  default="labpulse")
args = parser.parse_args()

session  = boto3.Session(profile_name=args.profile, region_name=args.region)
dynamodb = session.resource("dynamodb")

P = args.prefix

users_table     = dynamodb.Table(f"{P}-Users")
machines_table  = dynamodb.Table(f"{P}-Machines")
timetable_table = dynamodb.Table(f"{P}-Timetable")

# ── Machine API keys (save these!) ────────────────────────────────────────────
import secrets

LAB_MACHINES = {
    "CS-LAB-1": [f"CSL1-PC-{i:02d}" for i in range(1, 11)],
    "CS-LAB-2": [f"CSL2-PC-{i:02d}" for i in range(1, 9)],
    "IT-LAB":   [f"ITL-PC-{i:02d}"  for i in range(1, 9)],
    "ETC-LAB":  [f"ETCL-PC-{i:02d}" for i in range(1, 7)],
}

LAB_INFO = {
    "CS-LAB-1": {"name": "CS Lab 1",    "building": "D Block", "floor": "Ground", "department": "CSE"},
    "CS-LAB-2": {"name": "CS Lab 2",    "building": "D Block", "floor": "First",  "department": "CSE/IT"},
    "IT-LAB":   {"name": "IT Lab",      "building": "C Block", "floor": "Ground", "department": "IT"},
    "ETC-LAB":  {"name": "E&TC Lab",     "building": "B Block", "floor": "Second", "department": "E&TC"},
}

print("=== Seeding Machines ===")
api_keys = {}
for lab_id, machine_ids in LAB_MACHINES.items():
    for mid in machine_ids:
        raw_key = "lp_" + secrets.token_urlsafe(24)
        key_hash = "sha256:" + hashlib.sha256(raw_key.encode()).hexdigest()
        machines_table.put_item(Item={
            "machine_id":   mid,
            "lab_id":       lab_id,
            "hostname":     f"WIT-{mid}",
            "status":       "active",
            "api_key_hash": key_hash,
            "last_seen_at": None,
            "created_at":   time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        })
        api_keys[mid] = raw_key
        print(f"  [OK] {mid} ({lab_id})")

# Save API keys to a local file (DO NOT commit to git)
with open("machine_api_keys.json", "w") as f:
    json.dump(api_keys, f, indent=2)
print("\nSUCCESS: API keys saved to machine_api_keys.json (DO NOT commit to git!)\n")

# ── Students ──────────────────────────────────────────────────────────────────
print("=== Seeding Students ===")
STUDENTS = [
    {"student_id": f"CS2024{i:03d}", "name": f"Student {i}", "department": "CSE", "year": "BE",
     "college_login": f"student{i}@wit.ac.in", "role": "student"}
    for i in range(1, 31)
] + [
    {"student_id": f"IT2024{i:03d}", "name": f"IT Student {i}", "department": "IT", "year": "BE",
     "college_login": f"itstudent{i}@wit.ac.in", "role": "student"}
    for i in range(1, 21)
]

with users_table.batch_writer() as batch:
    for s in STUDENTS:
        batch.put_item(Item={**s, "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
        print(f"  [OK] {s['student_id']} — {s['name']}")

# ── Timetable ─────────────────────────────────────────────────────────────────
print("\n=== Seeding Timetable ===")
SLOTS = [
    # CS Lab 1
    {"lab_id": "CS-LAB-1", "day": "MON", "start": "09:00", "end": "10:00", "course": "CS301-DS Lab",   "faculty": "Dr. S. Kulkarni", "group": "CSE-SEM5"},
    {"lab_id": "CS-LAB-1", "day": "MON", "start": "10:00", "end": "11:00", "course": "CS302-OS Lab",   "faculty": "Prof. P. Jadhav", "group": "CSE-SEM5"},
    {"lab_id": "CS-LAB-1", "day": "TUE", "start": "09:00", "end": "10:00", "course": "CS303-CN Lab",   "faculty": "Dr. R. Deshmukh", "group": "CSE-SEM6"},
    {"lab_id": "CS-LAB-1", "day": "WED", "start": "14:00", "end": "15:00", "course": "CS201-OOP Lab",  "faculty": "Prof. A. Patil",  "group": "CSE-SEM3"},
    {"lab_id": "CS-LAB-1", "day": "THU", "start": "09:00", "end": "10:00", "course": "CS401-AI Lab",   "faculty": "Dr. K. Shinde",   "group": "CSE-SEM7"},
    {"lab_id": "CS-LAB-1", "day": "FRI", "start": "11:15", "end": "12:15", "course": "CS403-ML Lab",   "faculty": "Prof. V. Mane",   "group": "CSE-SEM7"},
    # IT Lab
    {"lab_id": "IT-LAB",   "day": "MON", "start": "11:15", "end": "12:15", "course": "IT201-Prog Lab", "faculty": "Prof. S. More",   "group": "IT-SEM3"},
    {"lab_id": "IT-LAB",   "day": "WED", "start": "09:00", "end": "10:00", "course": "IT301-Web Lab",  "faculty": "Dr. N. Kadam",    "group": "IT-SEM5"},
    {"lab_id": "IT-LAB",   "day": "FRI", "start": "14:00", "end": "15:00", "course": "IT401-DB Lab",   "faculty": "Prof. V. Mane",   "group": "IT-SEM6"},
    # E&TC Lab
    {"lab_id": "ETC-LAB",  "day": "TUE", "start": "14:00", "end": "15:00", "course": "EC301-DSP Lab",  "faculty": "Dr. R. Deshmukh", "group": "ETC-SEM5"},
    {"lab_id": "ETC-LAB",  "day": "THU", "start": "11:15", "end": "12:15", "course": "EC401-Emb Lab",  "faculty": "Dr. S. Kulkarni", "group": "ETC-SEM7"},
]

with timetable_table.batch_writer() as batch:
    for s in SLOTS:
        slot_id = f"{s['lab_id']}#{s['day']}#{s['start']}"
        batch.put_item(Item={
            "slot_id":       slot_id,
            "lab_id":        s["lab_id"],
            "day_of_week":   s["day"],
            "start_time":    s["start"],
            "end_time":      s["end"],
            "course_code":   s["course"],
            "faculty_name":  s["faculty"],
            "student_group": s["group"],
            "expected_count": 25,
        })
        print(f"  [OK] {slot_id}")

print("\nSUCCESS: Seed complete! Add machine API keys from machine_api_keys.json to each lab PC's config.json")
