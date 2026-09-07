"""
Purge mock/seed data from DynamoDB tables (labpulse-Timetable, labpulse-Machines, labpulse-Users).
Preserves the active local agent machine (CSL1-PC-01).

Usage:
  python purge_mock_data.py --region ap-south-1 --prefix labpulse
"""
import argparse
import boto3

parser = argparse.ArgumentParser(description="Purge mock data from DynamoDB")
parser.add_argument("--region", default="ap-south-1")
parser.add_argument("--prefix", default="labpulse")
parser.add_argument("--keep-agent-machine", action="store_true", default=True,
                    help="Keep CSL1-PC-01 configured in local agent config.json")
args = parser.parse_args()

session = boto3.Session(region_name=args.region)
dynamodb = session.resource("dynamodb")
P = args.prefix

machines_table  = dynamodb.Table(f"{P}-Machines")
timetable_table = dynamodb.Table(f"{P}-Timetable")
users_table     = dynamodb.Table(f"{P}-Users")
labs_table      = dynamodb.Table(f"{P}-Labs")

print(f"=== Purging mock data from '{P}' tables in region {args.region} ===")

# 1. Purge Timetable
print("\n1. Cleaning Timetable slots...")
tt_items = timetable_table.scan().get("Items", [])
print(f"   Found {len(tt_items)} timetable slot(s).")
deleted_tt = 0
for item in tt_items:
    slot_id = item.get("slot_id")
    if slot_id:
        timetable_table.delete_item(Key={"slot_id": slot_id})
        deleted_tt += 1
        print(f"   Deleted slot: {slot_id} ({item.get('course_code', '')})")
print(f"   Done: {deleted_tt} mock timetable slot(s) deleted.")

# 2. Purge Machines (preserve CSL1-PC-01)
print("\n2. Cleaning Machines...")
mach_items = machines_table.scan().get("Items", [])
print(f"   Found {len(mach_items)} machine(s).")
deleted_mach = 0
for item in mach_items:
    mid = item.get("machine_id")
    if args.keep_agent_machine and mid == "CSL1-PC-01":
        print(f"   [KEPT] Active agent machine: {mid}")
        continue
    if mid:
        machines_table.delete_item(Key={"machine_id": mid})
        deleted_mach += 1
        print(f"   Deleted machine: {mid} ({item.get('hostname', '')})")
print(f"   Done: {deleted_mach} mock machine(s) deleted.")

# 3. Purge Seed Students
print("\n3. Cleaning Seed Students...")
user_items = users_table.scan().get("Items", [])
print(f"   Found {len(user_items)} user(s).")
deleted_users = 0
for item in user_items:
    sid = item.get("student_id", "")
    login = item.get("college_login", "")
    # Check if student is a dummy seeded student (e.g. student1@wit.ac.in or itstudent1@wit.ac.in)
    if "student" in login.lower() and ("@wit.ac.in" in login.lower() or sid.startswith("CS2024") or sid.startswith("IT2024")):
        users_table.delete_item(Key={"student_id": sid})
        deleted_users += 1
        print(f"   Deleted dummy student: {sid} ({login})")
print(f"   Done: {deleted_users} dummy student(s) deleted.")

print("\n=== Purge Completed Successfully! ===")
print("All mock/seed data has been cleared from DynamoDB.")
print("The dashboard will now display pure real-time data.")
