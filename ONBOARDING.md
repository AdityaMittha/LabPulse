# LabPulse — Complete Developer & Contributor Onboarding Guide

> **Who is this for?**  
> A developer or coworker who has cloned this repo and wants to run the full LabPulse stack locally **and/or** deploy it to AWS from scratch on their own laptop.

---

## Table of Contents

1. [Project Architecture Overview](#1-project-architecture-overview)
2. [Prerequisites — Install Everything First](#2-prerequisites--install-everything-first)
3. [Clone the Repository](#3-clone-the-repository)
4. [Part A — Dashboard (React Frontend)](#part-a--dashboard-react-frontend)
5. [Part B — Backend (AWS SAM / Lambda)](#part-b--backend-aws-sam--lambda)
6. [Part C — Agent (Lab PC Monitor)](#part-c--agent-lab-pc-monitor)
7. [Connect Everything Together](#connect-everything-together)
8. [Deploy to AWS](#deploy-to-aws)
9. [Environment Variables & Secrets Reference](#environment-variables--secrets-reference)
10. [Troubleshooting](#troubleshooting)

---

## 1. Project Architecture Overview

```
lab-analytics/
├── dashboard/          ← React + Vite frontend (admin dashboard)
├── backend/            ← AWS SAM (Lambda + API Gateway + DynamoDB + Cognito)
├── agent/              ← Python agent that runs on every lab PC
├── deploy_dashboard.ps1   ← One-click dashboard deploy to S3
├── deploy_backend.ps1     ← One-click backend deploy to AWS
└── setup.bat              ← Agent mass-installer for lab PCs
```

**Data flow:**
```
Lab PC Agent ──HTTPS──► AWS API Gateway ──► Lambda ──► DynamoDB
                                                            │
Admin Dashboard ◄──────── Cognito Auth ◄───────────────────┘
```

**Live deployment (WIT Solapur):**
- Dashboard: `http://wit-solapur-labpulse-dashboard-8937.s3-website.ap-south-1.amazonaws.com`
- API Base URL: `https://cezkm5x4k8.execute-api.ap-south-1.amazonaws.com/v1`
- AWS Region: `ap-south-1` (Mumbai)

---

## 2. Prerequisites — Install Everything First

Install all of these before doing anything else. Each item has exact version requirements.

---

### 2.1 Git
Download and install from: https://git-scm.com/download/win

Verify:
```
git --version
# Expected: git version 2.x.x
```

---

### 2.2 Node.js (v20 LTS or higher)
Download from: https://nodejs.org/en/download  
Choose the **LTS** installer (.msi for Windows).

> During install, keep "Add to PATH" checked.

Verify:
```
node --version
# Expected: v20.x.x or higher

npm --version
# Expected: 10.x.x or higher
```

---

### 2.3 Python 3.12
Download from: https://www.python.org/downloads/  
Click "Download Python 3.12.x".

> On the first installer screen, check **"Add python.exe to PATH"** before clicking Install.

Verify:
```
python --version
# Expected: Python 3.12.x

pip --version
# Expected: pip 24.x.x from ...
```

---

### 2.4 AWS CLI v2
Download from: https://aws.amazon.com/cli/  
Run the .msi installer.

Verify:
```
aws --version
# Expected: aws-cli/2.x.x Python/3.x.x ...
```

**Configure your AWS credentials:**
```
aws configure
```
Enter:
- **AWS Access Key ID** — get from your AWS IAM user
- **AWS Secret Access Key** — get from your AWS IAM user
- **Default region name** — `ap-south-1`
- **Default output format** — `json`

> To get AWS credentials: Log into AWS Console → IAM → Users → your username → Security credentials → Create access key.

---

### 2.5 AWS SAM CLI
Download from: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html  
Run the .msi installer.

Verify:
```
sam --version
# Expected: SAM CLI, version 1.x.x
```

---

### 2.6 Docker Desktop (required for SAM build)
Download from: https://www.docker.com/products/docker-desktop/

After installing, start Docker Desktop and wait for it to show **"Engine running"**.

Verify:
```
docker --version
# Expected: Docker version 27.x.x, ...
```

> If you skip Docker, use `sam build` instead of `sam build --use-container` in backend steps.

---

### 2.7 VS Code (Recommended Editor)
Download from: https://code.visualstudio.com/

Recommended extensions:
- **Python** (Microsoft)
- **ESLint**
- **Prettier**
- **YAML** (Red Hat)

---

## 3. Clone the Repository

```powershell
# Navigate to wherever you keep projects
cd C:\Users\YourName\Projects

# Clone the repo
git clone https://github.com/AdityaMittha/LabPulse.git

# Enter the project folder
cd LabPulse
```

You should see this structure:
```
LabPulse/
├── agent/
├── backend/
├── dashboard/
├── deploy_backend.ps1
├── deploy_dashboard.ps1
├── setup.bat
├── SETUP.md
└── ONBOARDING.md  ← this file
```

---

## Part A — Dashboard (React Frontend)

### A.1 Install Dependencies

```powershell
cd dashboard
npm install
```

This installs all packages from `package.json` into `node_modules/` (React 19, Vite 8, Recharts, Tailwind, etc.).

---

### A.2 Run Dashboard Locally

```powershell
npm run dev
```

Open your browser to: **http://localhost:5173**

> The local dev server proxies `/v1/*` requests to the live AWS API Gateway automatically (configured in `vite.config.js`), so data loads from the real AWS backend even during local development.

**Login credentials:**
- Email: `admin@wit.ac.in`
- Password: *(ask project owner — Aditya)*

> To create a new admin Cognito user for yourself, see [Section B.6](#b6-create-your-own-admin-cognito-user).

---

### A.3 Build for Production

```powershell
npm run build
```

Output goes to `dashboard/dist/`. These are the static files uploaded to S3.

---

## Part B — Backend (AWS SAM / Lambda)

The backend is a fully serverless stack defined in `backend/template.yaml`. It creates:
- **AWS API Gateway HTTP API** (routes + CORS)
- **5 Lambda Functions** (Python 3.12)
- **10 DynamoDB Tables** (sessions, users, machines, labs, etc.)
- **Amazon Cognito User Pool** (admin authentication)

---

### B.1 Understand the Stack

| Resource | Name | Purpose |
|:---|:---|:---|
| API Gateway | `labpulse` | HTTP API, all routes |
| Lambda | `ValidateStudentFunction` | Agent: PNR login |
| Lambda | `IngestSummaryFunction` | Agent: hourly telemetry |
| Lambda | `SessionEndFunction` | Agent: session close |
| Lambda | `GetAnalyticsFunction` | Dashboard: analytics queries |
| Lambda | `ManageEntitiesFunction` | Dashboard: admin CRUD |
| DynamoDB | `labpulse-Sessions` | All student sessions |
| DynamoDB | `labpulse-Users` | Student PNR records |
| DynamoDB | `labpulse-Machines` | Lab machines + API keys |
| DynamoDB | `labpulse-Labs` | Lab metadata |
| DynamoDB | `labpulse-Departments` | Department metadata |
| DynamoDB | `labpulse-Timetable` | Weekly class timetable |
| DynamoDB | `labpulse-HourlyReports` | Hourly usage summaries |
| DynamoDB | `labpulse-AppUsage` | App-level usage data |
| DynamoDB | `labpulse-BehaviorMetrics` | Input activity metrics |
| DynamoDB | `labpulse-BrowserActivity` | Web browsing records |
| Cognito | `labpulse-users` | Admin dashboard auth |

---

### B.2 First-Time Backend Deploy (Fresh AWS Account)

> ⚠️ **Only do this if deploying to a NEW AWS account.** The WIT Solapur stack is already deployed and running. Skip to [Part C](#part-c--agent-lab-pc-monitor) if you just want to contribute to the existing deployment.

```powershell
cd backend

# Build the Lambda functions
sam build

# Deploy interactively for the first time
sam deploy --guided
```

When prompted, enter:
- **Stack Name**: `labpulse`
- **AWS Region**: `ap-south-1`
- **Parameter TablePrefix**: `labpulse`
- **Parameter AllowedOrigin**: `*`
- **Parameter SessionTokenSecret**: Choose a strong secret (e.g., `MySecret@2024!`)
- **Confirm changeset**: `y`
- **Save arguments to samconfig.toml**: `y`

After ~5 minutes, note the Outputs printed at the end:
```
ApiUrl            = https://XXXXXXXXXX.execute-api.ap-south-1.amazonaws.com/v1
CognitoUserPoolId = ap-south-1_XXXXXXX
CognitoClientId   = XXXXXXXXXXXXXXXXXXXXXXXXXX
```

Save these — you'll need them in subsequent steps.

---

### B.3 Subsequent Backend Deploys (Code Changes Only)

After the first deploy, `backend/samconfig.toml` remembers all parameters. Future deploys use:

```powershell
.\deploy_backend.ps1 -Secret "YourSessionTokenSecret"
```

Or manually:
```powershell
cd backend
sam build
sam deploy --parameter-overrides "SessionTokenSecret=YourSessionTokenSecret"
```

> ⚠️ **Never run `sam deploy --guided` again** — it will overwrite `samconfig.toml` and may reset the route configuration.

---

### B.4 Point Dashboard to Your New API (If New AWS Account)

Open `dashboard/vite.config.js` and change the proxy target:
```js
target: 'https://YOUR_NEW_API_ID.execute-api.ap-south-1.amazonaws.com',
```

Open `dashboard/src/api/apiClient.js` and update `API_BASE`:
```js
const API_BASE = "https://YOUR_NEW_API_ID.execute-api.ap-south-1.amazonaws.com/v1";
```

---

### B.5 Seed Initial Data (Optional)

The `backend/seed_data.py` script populates sample labs, students, and machines for testing:

```powershell
cd backend
python seed_data.py
```

To wipe all seed data:
```powershell
python purge_mock_data.py
```

---

### B.6 Create Your Own Admin Cognito User

After deploying the backend, create an admin user in Cognito:

```powershell
# Get your User Pool ID from the stack outputs
aws cloudformation describe-stacks --stack-name labpulse --region ap-south-1 --query "Stacks[0].Outputs[?OutputKey=='CognitoUserPoolId'].OutputValue" --output text
```

```powershell
# Create the user (replace YOUR_USER_POOL_ID and your email)
aws cognito-idp admin-create-user `
  --user-pool-id YOUR_USER_POOL_ID `
  --username "yourname@college.ac.in" `
  --temporary-password "TempPass@123" `
  --user-attributes Name=email,Value="yourname@college.ac.in" Name=email_verified,Value=true `
  --region ap-south-1

# Add user to admin group
aws cognito-idp admin-add-user-to-group `
  --user-pool-id YOUR_USER_POOL_ID `
  --username "yourname@college.ac.in" `
  --group-name admin `
  --region ap-south-1

# Set permanent password (skip forced reset)
aws cognito-idp admin-set-user-password `
  --user-pool-id YOUR_USER_POOL_ID `
  --username "yourname@college.ac.in" `
  --password "YourPassword@123" `
  --permanent `
  --region ap-south-1
```

---

## Part C — Agent (Lab PC Monitor)

The agent is a Python application that runs on every lab PC. It:
- Shows a custom login screen on startup
- Validates student PNR credentials against the API
- Tracks idle time, app usage, and browser activity
- Syncs data to AWS every hour and on shutdown

> **Platform note:** The agent is **Windows-only** (uses `pywin32`, Windows Task Scheduler, Win32 APIs).

---

### C.1 Install Agent Dependencies (for development/testing)

```powershell
cd agent

# Create a virtual environment
python -m venv venv

# Activate it
.\venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

Dependencies:
| Package | Purpose |
|:---|:---|
| `pywin32` | Windows API — lock screen, process tracking |
| `psutil` | CPU/memory/process monitoring |
| `pynput` | Keyboard/mouse activity monitoring |
| `requests` | HTTPS calls to API Gateway |
| `comtypes` | COM interface for Windows shell |
| `pyinstaller` | Build standalone .exe |

---

### C.2 Configure the Agent

Copy the example config:
```powershell
copy config.json.example config.json
```

Edit `agent\config.json`:
```json
{
  "machine_id": "MY-PC-01",
  "lab_id": "CS-LAB-1",
  "lab_name": "Computer Center 1",
  "college_name": "Walchand Institute of Technology, Solapur",
  "api_base_url": "https://cezkm5x4k8.execute-api.ap-south-1.amazonaws.com/v1",
  "api_key": "lp_YOUR_MACHINE_API_KEY_HERE",
  "idle_threshold_seconds": 60,
  "summary_interval_minutes": 60,
  "retry_interval_minutes": 5,
  "max_validate_attempts": 3,
  "log_level": "INFO"
}
```

> To get a machine API key:  
> Log into the dashboard → Admin → Machines → click **+ Add Machine** → copy the generated key immediately (shown only once).

---

### C.3 Run the Agent (Development Mode)

```powershell
# Make sure venv is activated
.\venv\Scripts\activate

# Run the agent
python src\main.py
```

The login screen will appear. Use any registered student PNR and password.

---

### C.4 Run Agent Tests

```powershell
python test_agent_features.py
```

---

### C.5 Build Standalone Executable (Optional)

```powershell
pyinstaller labpulse.spec
```

Output: `dist/labpulse.exe` — a single portable executable, no Python required on target PC.

---

### C.6 Install Agent on a Lab PC (Production)

Use the automated batch installer:

```powershell
# Right-click setup.bat and choose "Run as administrator"
.\setup.bat
```

Or manually:
```powershell
# Copy agent folder to C:\LabPulse
xcopy /E /I agent\ C:\LabPulse\

# Edit config
notepad C:\LabPulse\config.json

# Run installer (registers Windows Scheduled Tasks)
cd C:\LabPulse
powershell -ExecutionPolicy Bypass -File install.ps1
```

This registers:
- **Task `LabPulse`** — runs agent on every user logon
- **Task `LabPulse-Shutdown`** — syncs session data on shutdown (Event ID 1074)

---

## Connect Everything Together

End-to-end verification checklist:

| # | Test | Expected Result |
|:---|:---|:---|
| 1 | `npm run dev` in `dashboard/` | Opens at `http://localhost:5173` |
| 2 | Log in with admin credentials | Redirects to Overview page with stats |
| 3 | Admin → Labs | Shows registered labs |
| 4 | Admin → Machines → Add Machine | Generates machine API key |
| 5 | Update `agent/config.json` with machine ID + API key | — |
| 6 | `python src/main.py` in `agent/` | LabPulse login screen appears |
| 7 | Enter a registered student PNR + password | Desktop unlocks, session starts |
| 8 | Check Dashboard → Labs | Machine shows as **Active** |
| 9 | Wait or trigger session end | Dashboard shows session in Recent Sessions |

---

## Deploy to AWS

### Deploy Dashboard to S3

```powershell
.\deploy_dashboard.ps1
```

This builds the React app, creates/reuses the S3 bucket, configures static website hosting, and uploads all files.

**Live URL** printed at end:  
`http://<bucket-name>.s3-website.ap-south-1.amazonaws.com`

---

### Deploy Backend to AWS

```powershell
.\deploy_backend.ps1 -Secret "YourSessionTokenSecret"
```

---

## Environment Variables & Secrets Reference

| Variable / Config Key | Where set | Purpose |
|:---|:---|:---|
| `SessionTokenSecret` | SAM parameter | Signs agent session tokens |
| `TablePrefix` | SAM parameter (default: `labpulse`) | DynamoDB table name prefix |
| `AllowedOrigin` | SAM parameter (default: `*`) | CORS allowed origin |
| `api_key` in `agent/config.json` | Admin Dashboard → Machines | Machine-specific API key |
| `api_base_url` in `agent/config.json` | SAM output `ApiUrl` | API Gateway endpoint |
| AWS credentials | `aws configure` | Deployment access |

> ⚠️ **Never commit** `agent/config.json` (real machine data) or any `api_key` values to Git.  
> These are excluded in `.gitignore`.

---

## Troubleshooting

### Dashboard

| Problem | Fix |
|:---|:---|
| `npm install` fails | Node.js v20+ required. Run `node --version`. |
| Dashboard blank on S3 URL | Use the **S3 Website endpoint** (`s3-website.*`), not the S3 Object URL. |
| "Failed to fetch" in browser console | Check API Gateway routes — must be `GET/POST/DELETE`, not `ANY`. |
| Login fails with "Incorrect credentials" | Verify Cognito user exists. Follow Section B.6 to create one. |
| Data doesn't load after login | 401 in network tab = Cognito token expired. Log out and back in. |

### Backend / SAM

| Problem | Fix |
|:---|:---|
| `sam: command not found` | Restart PowerShell after SAM CLI install. |
| `sam build` fails | Start Docker Desktop, or omit `--use-container`. |
| `sam deploy` says "No changes to deploy" | No Lambda code changed. Stack is up to date — OK. |
| `sam deploy` resets routes | Never use `--guided`. Use `deploy_backend.ps1` which reads `samconfig.toml`. |
| `ResourceNotFoundException` in Lambda logs | DynamoDB table doesn't exist. Check `TABLE_PREFIX` env var. |

### Agent

| Problem | Fix |
|:---|:---|
| `python is not recognized` | Reinstall Python with "Add to PATH" checked. |
| `403 Forbidden` / `Invalid API Key` | `api_key` in `config.json` doesn't match the registered machine. |
| `Student not found` on login | PNR not registered. Add student in Admin → Students. |
| Login screen doesn't appear at startup | Run `install.ps1` as Administrator. |
| Firewall blocks API calls | Whitelist `https://cezkm5x4k8.execute-api.ap-south-1.amazonaws.com` (port 443). |
| `pywin32` import error | Run `python -m pywin32_postinstall -install` as Administrator. |

### AWS

| Problem | Fix |
|:---|:---|
| `Unable to locate credentials` | Run `aws configure` with your IAM access key. |
| `AccessDeniedException` | IAM user lacks permissions. Attach `AdministratorAccess` policy for dev. |
| CloudFormation stack stuck in `ROLLBACK` | Delete the failed stack: `aws cloudformation delete-stack --stack-name labpulse --region ap-south-1` then re-deploy. |

---

## Quick Reference

| Item | Value |
|:---|:---|
| GitHub Repo | https://github.com/AdityaMittha/LabPulse |
| Live Dashboard | http://wit-solapur-labpulse-dashboard-8937.s3-website.ap-south-1.amazonaws.com |
| API Base URL | `https://cezkm5x4k8.execute-api.ap-south-1.amazonaws.com/v1` |
| AWS Region | `ap-south-1` (Mumbai) |
| CloudFormation Stack | `labpulse` |
| S3 Dashboard Bucket | `wit-solapur-labpulse-dashboard-8937` |

---

*Last updated: September 2026 — LabPulse v1.0 · Walchand Institute of Technology, Solapur*
