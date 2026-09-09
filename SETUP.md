# LabPulse — Lab PC Agent Setup Guide

This guide covers the complete step-by-step procedure to set up and connect a lab PC to the LabPulse cloud system, configure the admin dashboard, and deploy the agent across multiple computers in a lab.

---

## Part 1: Admin Dashboard Configuration (Do This First)

Before configuring any lab PC, the administrator must register the lab and machine details in the dashboard.

- **Dashboard URL**: `http://wit-solapur-labpulse-dashboard-8937.s3-website.ap-south-1.amazonaws.com`  
  *(Or `http://localhost:5173` for local development)*
- **Admin Login**: `admin@wit.ac.in` / `Admin@123`

### Step 1: Add Department
1. Open **Admin → Departments** (`/admin/departments`).
2. Click **+ Add Department**.
3. Enter:
   - **Department Code**: e.g., `CSE`
   - **Full Name**: e.g., `Computer Science & Engineering`
   - **Building**: e.g., `D Block`
   - **HOD Name**: e.g., `Dr. S. K. Dixit`
4. Click **Add Department**.

### Step 2: Add Computer Lab
1. Open **Admin → Labs** (`/admin/labs`).
2. Click **+ Add Lab**.
3. Enter:
   - **Lab ID**: e.g., `CS-LAB-1` *(Keep note of this ID)*
   - **Lab Name**: e.g., `Computer Center 1`
   - **Department**: Select `CSE`
   - **Building & Floor**: e.g., `D Block`, `Ground`
   - **Capacity**: e.g., `40` seats
4. Click **Add Lab**.

### Step 3: Register Machine & Get API Key
1. Open **Admin → Machines** (`/admin/machines`).
2. Click **+ Add Machine**.
3. Enter:
   - **Machine ID**: e.g., `CSL1-PC-01`
   - **Lab**: Select `Computer Center 1 (CS-LAB-1)`
   - **Hostname**: Computer name (e.g. `CSL1-PC-01`)
4. Click **Register Machine**.

> [!IMPORTANT]
> **CRITICAL NOTE ON API KEY**:  
> A popup will show your new Machine API Key (format: `lp_...`).  
> Copy and save this key immediately! It is shown **only once** for security and cannot be retrieved later. Each lab PC requires its own matching API key.

### Step 4: Add Students (PNR Credentials)
1. Open **Admin → Students** (`/admin/students`).
2. Click **+ Add Student**.
3. Enter the student details including:
   - **PNR No.**: e.g., `2024WIT001` *(Printed on college ID card)*
   - **Password**: Password used by student to unlock PC
   - **Student ID, Name, Department, Year**

> [!NOTE]
> Students log into lab PCs using their **PNR No.** and **Password**.

### Step 5: Configure Timetable
1. Open **Admin → Timetable** (`/admin/timetable`).
2. Click **Import CSV** → **Download Template** to get the standard CSV template.
3. Add class slots and click **Upload** to populate the weekly schedule.

---

## Part 2: Step-by-Step Agent Download & Setup on Lab PC

### Prerequisites on the Lab PC:
1. Windows 10 or 11 (64-bit).
2. Python 3.10 or higher installed.
   > [!IMPORTANT]
   > During Python installation, you **must check**:  
   > `[x] Add python.exe to PATH`

---

### Method 1: Automated USB Pen Drive & GitHub Setup (`setup.bat`) — Recommended

This method allows setting up any lab PC in **under 30 seconds**:

1. **Prepare your USB Pen Drive**:
   Copy two files to your USB drive root:
   - [`setup.bat`](setup.bat)
   - `api_keys.txt` containing your registered machine IDs and API keys (see `api_keys.sample.txt`):
     ```text
     CSL1-PC-01,lp_oSbz206JnrsshznYuM-byN-RNMIrPDGg
     CSL1-PC-02,lp_0lMD0l7HCoKkVOWjBMWRNG1z8IkRwY7X
     CSL1-PC-03,lp_jufQh3kqBLkSSc5liwmHFBhJn7m-SB97
     ```
2. **Plug USB Drive into the Lab PC**.
3. **Right-click `setup.bat`** on the USB drive and choose **"Run as administrator"**.
4. **Follow the On-Screen Prompts**:
   - The script prompts for the Machine ID (defaults to the computer's Windows hostname).
   - It automatically searches the USB drive for `api_keys.txt` (or `keys.csv` / `machine_api_keys.json`) and **extracts the API key for that machine automatically**.
   - It **downloads the latest agent package directly from GitHub** (`AdityaMittha/LabPulse`).
   - It creates `C:\LabPulse`, writes the configuration, sets up dependencies, and registers Windows Scheduled Tasks.
   - It tests the AWS API connection and confirms: `[SUCCESS] Cloud API Gateway reached successfully!`.

---

### Method 2: Manual Download & Installation

If you prefer to install manually without the automated batch file:

#### Step 1: Download Agent Files
- Click **Download Agent Pack** in the dashboard sidebar to get `labpulse-agent.zip`, or copy the `agent/` folder from the project to `C:\LabPulse`.

#### Step 2: Configure `C:\LabPulse\config.json`
Open `C:\LabPulse\config.json` in Notepad:
```json
{
  "machine_id": "CSL1-PC-01",
  "lab_id": "CS-LAB-1",
  "lab_name": "Computer Center 1",
  "college_name": "Walchand Institute of Technology, Solapur",
  "api_base_url": "https://cezkm5x4k8.execute-api.ap-south-1.amazonaws.com/v1",
  "api_key": "PASTE_YOUR_COPIED_API_KEY_HERE",
  "idle_threshold_seconds": 60,
  "summary_interval_minutes": 60,
  "retry_interval_minutes": 5,
  "max_validate_attempts": 3,
  "log_level": "INFO"
}
```

#### Step 3: Run PowerShell Installer
Open PowerShell as Administrator:
```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
cd C:\LabPulse
powershell -File ".\install.ps1" -InstallDir "C:\LabPulse"
```

What the installer does automatically:
- Creates the local virtual environment and installs required libraries (`requests`, `pynput`, `pywin32`, `comtypes`).
- Registers Windows Scheduled Task **`LabPulse`** (launches lock screen automatically on user logon).
- Registers Windows Scheduled Task **`LabPulse-Shutdown`** (listens for Windows Event ID 1074 to sync telemetry to cloud just before PC powers down).

---

### Step 5: Test and Verify
1. Log off Windows or restart the PC.
2. When Windows signs in, the **LabPulse Student Login screen** will appear immediately in full screen.
3. Enter a registered student's **PNR No.** and **Password**.
4. Click **Login to Workstation**. The desktop unlocks and tracking begins.
5. In the Dashboard under **Labs → Computer Center 1**, the machine will turn **Active** (green indicator).

---

## Part 3: Note for Multiple PCs (Lab Mass Deployment)

When setting up 30 to 60+ computers in a lab, follow this optimized workflow:

> [!TIP]
> **Batch Registration Strategy**:
> 1. In the Admin Dashboard (**Admin → Machines**), register all machines at once:
>    - `CSL1-PC-01`
>    - `CSL1-PC-02`
>    - `CSL1-PC-03` ... up to `CSL1-PC-40`
> 2. Save each machine's generated API key into a single text file or spreadsheet on an Admin USB drive.

### Fast USB Setup per PC:
1. Copy `C:\LabPulse` (including the installed virtual environment) onto a USB flash drive.
2. Walk to each lab PC:
   - Copy `LabPulse` folder to `C:\LabPulse`.
   - Open `C:\LabPulse\config.json`, update `machine_id` (`CSL1-PC-02`) and paste its corresponding `api_key`.
   - Open PowerShell as Administrator and run:
     ```powershell
     cd C:\LabPulse
     .\install.ps1 -InstallDir "C:\LabPulse"
     ```
   - Done! Setup takes **under 45 seconds per PC**.

---

### Note for Disk Cloning (Clonezilla / FOG / Sysprep / Norton Ghost):
If you deploy Windows via disk imaging:
1. Install Python and run `install.ps1` on the master machine.
2. Clone the image to all 40 lab PCs.
3. After cloning, the only step on each individual PC is opening `C:\LabPulse\config.json` and changing the `machine_id` and `api_key`.

---

### Note for Reboot-Restore Software (Deep Freeze / Drive Vaccine):
> [!WARNING]
> If your lab uses **Deep Freeze** or reboot-restore software:
> - The agent maintains an offline queue (`agent_queue.db`) and session tokens in `C:\LabPulse`.
> - If `C:\LabPulse` is frozen, offline telemetry collected during network drops or power cuts will be wiped on reboot!
> - **Configuration**: Ensure `C:\LabPulse` is located on an **unfrozen partition** (e.g. `D:\LabPulse` or a ThawSpace), or add `C:\LabPulse` to the Deep Freeze folder exclusion list.

---

## Part 4: How the System Connects to Cloud & Dashboard

### 1. Cloud Connection Flow
```
┌────────────────────────┐      HTTPS POST /agent/validate      ┌────────────────────────┐
│  Lab PC (Agent UI)     │ ───────────────────────────────────► │  AWS API Gateway       │
│  PNR No. + Password    │                                      │  https://cezkm5x4k8... │
│  Header: x-api-key     │ ◄─────────────────────────────────── │                        │
└────────────────────────┘          Signed Session Token        └───────────┬────────────┘
                                                                            │
                                                                            ▼
                                                                ┌────────────────────────┐
                                                                │  AWS Lambda            │
                                                                │  Checks x-api-key      │
                                                                │  Checks PNR in DynamoDB│
                                                                └───────────┬────────────┘
                                                                            │
                                                                            ▼
                                                                ┌────────────────────────┐
                                                                │  Amazon DynamoDB       │
                                                                │  labpulse-Machines     │
                                                                │  labpulse-Users        │
                                                                │  labpulse-Sessions     │
                                                                └───────────┬────────────┘
                                                                            │
                                                                            ▼
                                                                ┌────────────────────────┐
                                                                │  React Dashboard       │
                                                                │  Real-time Active State│
                                                                └────────────────────────┘
```

### 2. Pre-Shutdown Synchronization (Event ID 1074)
- When a user shuts down or restarts the PC, Windows raises Event ID 1074.
- The `LabPulse-Shutdown` scheduled task immediately executes `main.py --shutdown-sync`.
- In-memory usage statistics and session end timestamps are flushed to the cloud `/agent/session-end`.
- The user is logged out so that on next turn-on, a fresh student login prompt appears.

### 3. Offline Fault Tolerance & Boot Drain
- If the lab network or internet drops:
  - Telemetry is saved in a local SQLite database: `C:\LabPulse\agent_queue.db`.
  - Session state is saved in `C:\LabPulse\pending_session.json`.
- When the PC turns on again:
  - The agent automatically **drains and uploads** all pending offline records to AWS *before* displaying the login screen for the next user.

---

## Part 5: Troubleshooting & Support Notes

### Where to Find Logs:
Agent log files are stored at:
`C:\LabPulse\logs\agent.log`

To view live agent logs, open PowerShell:
```powershell
Get-Content C:\LabPulse\logs\agent.log -Wait -Tail 30
```

### Common Gotchas:

| Issue | Cause | Fix |
|---|---|---|
| `403 Forbidden` / `Invalid API Key` | `api_key` in `config.json` doesn't match dashboard | Verify the machine ID in Admin → Machines and regenerate/re-copy the API key. |
| Student login fails: `Student not found` | PNR number not registered in DB | Ensure student was registered with the exact PNR number in Admin → Students. |
| Login screen doesn't show up on startup | Task Scheduler task not registered | Run `install.ps1` as Administrator. Check `schtasks /query /tn LabPulse`. |
| Python error: `python is not recognized` | Python not in system PATH | Reinstall Python and make sure to check `Add python.exe to PATH`. |
| Firewall error: `Failed to establish connection` | Outbound port 443 blocked | Whitelist `https://cezkm5x4k8.execute-api.ap-south-1.amazonaws.com` on firewall. |

### How to Uninstall Agent:
Open PowerShell as Administrator:
```powershell
Unregister-ScheduledTask -TaskName "LabPulse" -Confirm:$false
Unregister-ScheduledTask -TaskName "LabPulse-Shutdown" -Confirm:$false
Remove-Item -Recurse -Force "C:\LabPulse"
```
