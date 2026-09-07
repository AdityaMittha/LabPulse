# LabPulse

**Privacy-preserving, real-time computer lab usage analytics system for Walchand Institute of Technology (WIT), Solapur.**

LabPulse tracks application usage, active vs. idle duration, browser site visits, and timetable compliance across college computer labs without ever capturing keystrokes, clipboard contents, or screen captures. Built as a final-year B.E. computer engineering capstone project.

---

## Architecture Overview

```
   ┌────────────────────────────────┐                 HTTPS
   │      Windows Lab PC Agent      │ ──────────────────────────────────────► ┌─────────────────────────────────────────┐
   │  (Python 3.12, Win32, Tkinter) │           hourly summaries,             │      AWS API Gateway + Lambda (v1)      │
   │                                │         real-time telemetry,            │   (validate, ingest, session, analytics, │
   │   • PNR & Password Login UI    │         pre-shutdown sync               │    manage entities: depts, labs, etc.)  │
   │   • Win32 Active Window Hook   │ ◄────────────────────────────────────── │                                         │
   │   • UI Automation Browser Tab  │          session token, auth            └───────────────────┬─────────────────────┘
   │   • SQLite / Offline Queue     │                                                             │
   │   • Shutdown Trigger Task      │                                                             │
   └────────────────────────────────┘                                                             │
                                                                                                  ▼
                                                                              ┌─────────────────────────────────────────┐
                                                                              │            Amazon DynamoDB              │
                                                                              │  • labpulse-Departments                 │
                                                                              │  • labpulse-Labs                        │
                                                                              │  • labpulse-Machines                    │
                                                                              │  • labpulse-Users (by_pnr GSI)          │
                                                                              │  • labpulse-Timetable                   │
                                                                              │  • labpulse-Sessions                    │
                                                                              │  • labpulse-AppUsage                    │
                                                                              │  • labpulse-BehaviorMetrics             │
                                                                              │  • labpulse-HourlyReports               │
                                                                              │  • labpulse-BrowserActivity             │
                                                                              └───────────────────┬─────────────────────┘
                                                                                                  │
                                                                                                  ▼
                                                                              ┌─────────────────────────────────────────┐
                                                                              │      React + Vite Web Dashboard         │
                                                                              │  (Hosted on AWS S3 Static Website)      │
                                                                              │                                         │
                                                                              │  • Real-Time Analytics & Heatmaps       │
                                                                              │  • Lab & Machine Drilldown Views        │
                                                                              │  • Timetable Compliance & Browser Logs  │
                                                                              │  • Admin: Departments, Labs, Machines,  │
                                                                              │    Students (PNR), Timetable (CSV)      │
                                                                              └─────────────────────────────────────────┘
```

---

## Key Features

### 1. PNR-Based Student Login & PC Locking
- On system boot, the agent displays a full-screen Tkinter login prompt requiring student **PNR No.** (Permanent Registration Number) and password.
- Passwords are encrypted with SHA-256 before transit and verified against the `by_pnr` Global Secondary Index (GSI) on DynamoDB.
- Students are strictly logged out on system shutdown/restart.

### 2. Pre-Shutdown Cloud Sync & SQLite Fallback
- **Shutdown Interception**: Listens to Windows Event ID 1074 via a high-priority scheduled task (`--shutdown-sync`) to flush in-memory telemetry and close the cloud session before shutdown.
- **Offline Fault Tolerance**: If network connectivity fails during shutdown, session data and pending summaries are queued locally in SQLite (`agent_queue.db`) and `pending_session.json`.
- **Boot-Time Drain**: When the PC turns on, the agent drains and uploads all pending offline sessions *before* displaying the login screen for the next student.

### 3. Dynamic Department Management
- Manage college departments dynamically (`/admin/departments`) without hardcoded values.
- Stores department code (e.g. `CSE`, `IT`, `E&TC`), full name, campus building, and Head of Department (HOD).
- Department dropdowns automatically synchronize across Labs, Students, and Timetables.

### 4. Dynamic Lab & Machine Management
- Fully interactive CRUD for physical computer labs (`/admin/labs`) with building, floor, department, and seating capacity.
- Machine registration (`/admin/machines`) generates cryptographically secure API keys (`lp_...`) hashed with SHA-256 for agent authentication.

### 5. Timetable Management & CSV Import / Export
- **Weekly Schedule Grid**: Visual 6-day timetable calendar view (MON–SAT) per computer lab.
- **CSV Import**:
  - Download pre-configured CSV template directly from the modal.
  - Client-side validation for time formats (`HH:MM`), weekdays, and lab IDs.
  - Interactive row preview with `Ready` vs `Error` badges before import.
  - Batch uploader with live progress bar and automatic calendar refresh.
- **CSV Export**: Export current lab schedules with one click.

### 6. Timetable CSV Schema
```csv
lab_id,day_of_week,start_time,end_time,course_code,faculty_name,student_group,expected_count
CS-LAB-1,MON,09:00,11:00,CS301-Data Structures Lab,Dr. S. K. Sharma,CSE-B1,25
CS-LAB-1,MON,11:15,13:15,CS302-Operating Systems Lab,Prof. P. R. Kulkarni,CSE-B2,28
CS-LAB-1,TUE,10:00,12:00,CS303-Database Systems Lab,Dr. A. B. Joshi,CSE-B1,25
CS-LAB-1,WED,14:00,16:00,CS304-Computer Networks Lab,Prof. M. V. Patil,CSE-B3,24
CS-LAB-1,THU,09:00,11:00,CS305-Web Technologies Lab,Dr. N. T. Kadam,CSE-B2,26
CS-LAB-1,FRI,11:15,13:15,CS306-Cloud Computing Lab,Prof. R. S. Mane,CSE-B1,30
```

### 7. Privacy-First Analytics
- **Monitored**: Foreground executable names (e.g. `code.exe`, `chrome.exe`), active/idle duration, browser tab domains, event counts.
- **Never Logged**: Keystrokes, clipboard contents, screen captures, or webcam.
- Tables encrypted at rest via AWS KMS.

---

## Directory Structure

```
lab-analytics/
├── agent/                         # Windows background telemetry agent
│   ├── src/
│   │   ├── main.py                # Tkinter PNR UI, boot drain & shutdown handler
│   │   ├── auth.py                # PNR/password authentication client
│   │   ├── tracker.py             # Win32 active window & mouse/keyboard tracker
│   │   ├── summarizer.py          # Hourly usage aggregation
│   │   ├── uploader.py            # HTTPS telemetry uploader with SQLite queue
│   │   ├── offline_store.py       # Pending session state persistence
│   │   └── config.py              # Local machine configuration loader
│   ├── install.ps1                # PowerShell installer for Windows Scheduled Tasks
│   └── requirements.txt           # Python dependencies
│
├── backend/                       # AWS Serverless Application Model (SAM)
│   ├── functions/
│   │   ├── manage_entities/       # CRUD: departments, labs, machines, students, timetable
│   │   ├── validate_student/      # Student PNR validation & session token issuance
│   │   ├── ingest_summary/        # Ingestion of hourly agent telemetry
│   │   ├── session_end/           # Session closure & pre-shutdown flush
│   │   └── get_analytics/         # Aggregated usage, compliance & browser stats
│   ├── template.yaml              # SAM template defining 9 DynamoDB tables, API Gateway & Lambdas
│   └── purge_mock_data.py         # Utility to purge mock seed data from DynamoDB
│
├── dashboard/                     # React + Vite admin dashboard
│   ├── src/
│   │   ├── api/apiClient.js       # Centralized API service for live AWS backend
│   │   ├── auth/AuthContext.jsx   # Cognito authentication context & session storage
│   │   ├── components/            # Reusable Navbar, Sidebar, PageWrapper, MetricCard
│   │   └── pages/
│   │       ├── OverviewPage.jsx         # Real-time lab activity & utilization
│   │       ├── LabsPage.jsx             # All physical labs overview
│   │       ├── LabDetailPage.jsx        # Machine grid & live session drilldown
│   │       ├── MachineDetailPage.jsx    # Machine telemetry history
│   │       ├── StudentDetailPage.jsx    # Student session breakdown & top sites
│   │       ├── CompliancePage.jsx       # Timetable vs actual utilization compliance
│   │       ├── ReportsPage.jsx          # Usage trend analytics & exports
│   │       ├── AdminDepartmentsPage.jsx # Academic department CRUD
│   │       ├── AdminLabsPage.jsx        # Computer lab CRUD
│   │       ├── AdminMachinesPage.jsx    # Machine registration & API keys
│   │       ├── AdminStudentsPage.jsx    # Student registration with PNR & password
│   │       └── AdminTimetablePage.jsx   # Weekly schedule & CSV Import / Export
│   ├── package.json
│   └── vite.config.js
│
└── README.md
```

---

## Local Development Setup

### 1. Dashboard (React + Vite)
```bash
cd dashboard
npm install
npm run dev
```
Open `http://localhost:5173`. Sign in with administrator credentials:
- **Email**: `admin@wit.ac.in`
- **Password**: `Admin@123`

### 2. Windows Agent
```bash
cd agent
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python src/main.py
```

---

## Deployment Guide

### 1. Deploy AWS Backend (SAM)
Ensure you have the [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) installed and configured with AWS credentials:
```bash
cd backend
sam build
sam deploy --stack-name labpulse --region ap-south-1 --capabilities CAPABILITY_IAM --resolve-s3
```

### 2. Deploy Dashboard to AWS S3
```bash
cd dashboard
npm run build -- --mode production
aws s3 sync ./dist s3://<your-s3-bucket-name> --delete
```

### 3. Deploy Lab Agent to Windows PCs
> [!TIP]
> For the complete, step-by-step installation guide, multi-PC deployment guide, and troubleshooting notes, see:
> - [**SETUP.md**](SETUP.md) (Markdown formatted guide)
> - [**SETUP.txt**](SETUP.txt) (Plain text version for Notepad)

Quick setup on a lab PC:
1. Register the machine in **Admin → Machines** to obtain its unique `api_key` (`lp_...`).
2. Download the Agent pack from the sidebar (**Download Agent Pack**) or copy the `agent/` folder to `C:\LabPulse`.
3. In `C:\LabPulse\config.json`, enter the `machine_id` (e.g. `CSL1-PC-01`), `lab_id`, and `api_key`.
4. Open PowerShell as Administrator and run:
   ```powershell
   Set-ExecutionPolicy Bypass -Scope Process -Force
   powershell -File "C:\LabPulse\install.ps1" -InstallDir "C:\LabPulse"
   ```
5. On Windows logon, the agent launches automatically, syncs offline telemetry, and prompts students for their **PNR No.** and password.

---

## License

MIT License. Developed for Walchand Institute of Technology, Solapur.
