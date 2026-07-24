# LabPulse — Computer Lab Usage Analytics System
### Walchand Institute of Technology, Solapur

> Privacy-preserving, timetable-aware lab monitoring system.  
> Python Windows agent → AWS serverless backend → React analytics dashboard.

---

## 🛠️ Complete Installation Guide for Lab PCs

Follow these steps to deploy and configure the monitoring agent on a lab computer.

### Step 1: Obtain the Machine API Key
Each computer needs a unique identity and API key to validate sessions with the AWS cloud database.
1. Log in to the **Admin Dashboard** (`http://localhost:5173`) using an admin account (e.g., `admin@wit.ac.in` / `Admin@123`).
2. Go to the **Admin -> Machines** section.
3. Register the new machine by providing:
   * **Machine ID**: E.g., `CSL1-PC-02`
   * **Lab ID**: E.g., `CS-LAB-1`
   * **Hostname**: E.g., `WIT-CSL1-PC-02`
4. Copy the **Machine API Key** generated in the green popup (e.g., `lp_XXXX...`). **Write this down immediately** as it is hashed using SHA-256 in the cloud and will not be displayed again.
   * *Note: If you seeded initial data, you can find preexisting keys inside the `backend/machine_api_keys.json` file.*

---

### Step 2: Download the Installer Pack
1. In the **Admin Dashboard** sidebar, click the **"Download Agent Pack"** button.
2. A file named `labpulse-agent.zip` will download. 
3. Move this ZIP file to the target lab computer using a USB drive, network share, or local download.

---

### Step 3: Extract and Install the Agent
1. **Extract the ZIP file** to a local directory (e.g., `E:\Downloads\labpulse-agent`). The folder contains:
   * `labpulse.exe` (The compiled background tracking application)
   * `config.json` (The local system configuration)
   * `install.ps1` (The automated PowerShell installation script)
2. Open **PowerShell as Administrator** on the lab computer:
   * Click Start, type `PowerShell`, right-click it, and select **"Run as Administrator"**.
3. Navigate to the extracted folder:
   ```powershell
   cd "E:\Downloads\labpulse-agent"
   ```
4. Bypass PowerShell script execution policies for the active terminal session and execute the installer:
   ```powershell
   Set-ExecutionPolicy Bypass -Scope Process -Force
   .\install.ps1 -InstallDir "C:\LabPulse"
   ```
5. You should see a green **"Installation complete!"** message. The files are now copied to `C:\LabPulse`, and a Windows Scheduled Task named **"LabPulse"** has been created to launch the tracker automatically at user logon.

---

### Step 4: Configure the Local Agent Settings
1. Navigate to the installation directory:
   ```powershell
   cd C:\LabPulse
   ```
2. Open `config.json` in Notepad:
   ```powershell
   notepad config.json
   ```
3. Edit the following fields with the details from **Step 1**:
   ```json
   {
     "machine_id": "CSL1-PC-02",
     "lab_id": "CS-LAB-1",
     "lab_name": "CS Lab 1",
     "api_base_url": "https://cezkm5x4k8.execute-api.ap-south-1.amazonaws.com/v1",
     "api_key": "YOUR_MACHINE_API_KEY_HERE"
   }
   ```
   *(Ensure `api_base_url` points to the live AWS API Gateway endpoint, and `api_key` contains the raw key starting with `lp_`).*
4. Save the file (`Ctrl + S`) and close Notepad.

---

### Step 5: Test and Verify the Installation
1. **Trigger Logon**: Log out of the Windows user account and log back in, OR restart the computer.
2. **Verify Login Window**: Upon logging in, the **LabPulse Sign-in** window will automatically appear on the screen, prompting the student for their College ID and password.
3. **Verify Background Service**: After entering a valid college ID (e.g., `student1@wit.ac.in`) and clicking "Start Session", the window will disappear, and the tracking engine will run silently in the background.
4. **Inspect Local Logs**: Check the generated logs to confirm the connection:
   * Open the log folder at `C:\LabPulse\logs`.
   * Open the latest log file. You should see lines indicating that the configuration loaded, and that the session successfully started:
     `Session started: id=XXXX... student=student1@wit.ac.in`

---

## 🛠️ Developer Local Sandbox Start

If you are running the project locally in development mode:

### 1. Dashboard (Mock data fallback mode)
```powershell
cd dashboard
npm install
npm run dev
# Visit http://localhost:5173
# Login: admin@wit.ac.in / Admin@123
#        faculty@wit.ac.in / Faculty@123
```

### 2. Connect Dashboard to Live AWS Backend
1. Create a `dashboard/.env` file:
   ```env
   VITE_API_BASE_URL=/v1
   VITE_COGNITO_USER_POOL_ID=ap-south-1_3c8VUE5RQ
   VITE_COGNITO_CLIENT_ID=6u26jrfopqhvd04mhlhugnig23
   VITE_AWS_REGION=ap-south-1
   ```
2. Start the Vite server. Vite automatically proxies `/v1` requests to the AWS serverless stack configured in `vite.config.js` to bypass browser CORS preflights.
3. Log in using Cognito pool users created in Step 2 of backend setup:
   * **Admin User**: `admin@wit.ac.in` / `Admin@123`
   * **Faculty User**: `faculty@wit.ac.in` / `Faculty@123`

---

## 🔒 Privacy & Security Features

LabPulse provides structured lab utilization analytics and browser activity insights:
* ❌ **Never recorded**: Individual keypress characters (passwords, raw text), clipboard data, or screen captures.
* ✅ **Recorded**: Application executables (`code.exe`, `chrome.exe`), active/idle durations, keyboard/mouse input counts, browser window/tab titles, page URLs, domain visit stats, and session login/logout timestamps.
* 🔒 **Data Encryption**: All communication channels are enforced over HTTPS. Database tables are encrypted at rest using AWS KMS keys.

---

## 📁 Repository Structure

```
lab-analytics/
├── agent/              Python Windows monitoring agent
│   ├── src/
│   │   ├── main.py     Entry point, tkinter login prompt, session lifecycle
│   │   ├── tracker.py  Foreground app, keyboard/mouse counts, idle detection
│   │   ├── summarizer.py  Hourly aggregation, privacy enforcement
│   │   ├── uploader.py HTTPS POST + SQLite offline queue
│   │   ├── auth.py     LDAP/AD validation via backend API
│   │   └── config.py   config.json loader
│   ├── config.json.example
│   └── install.ps1     PowerShell installer + Scheduled Task (Pure ASCII)
│
├── backend/            AWS serverless backend (SAM)
│   ├── functions/
│   │   ├── validate_student/   Validates student, creates session, returns token
│   │   ├── ingest_summary/     Receives hourly summaries, enforces privacy
│   │   ├── session_end/        Finalizes session, computes compliance
│   │   ├── get_analytics/      Dashboard data queries
│   │   └── manage_entities/    Admin CRUD (machines, students, timetable)
│   ├── template.yaml   SAM IaC: all DynamoDB tables, API Gateway, Lambda, Cognito
│   └── seed_data.py    Seeds WIT Solapur initial data
│
├── dashboard/          React + Vite + Tailwind CSS admin dashboard
│   └── src/
│       ├── api/        apiClient.js (handles proxy routing and Cognito token insertion)
│       ├── auth/       AuthContext.jsx (native base64 ID Token claim decoder)
│       ├── pages/      Overview, Labs, Machines, Students, Compliance, etc.
│       ├── components/ Sidebar, TopBar, Shared layouts
│       └── data/       mockData.js (local fallback when VITE_API_BASE_URL is not set)
```
