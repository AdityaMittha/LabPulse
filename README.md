# LabPulse — Computer Lab Usage Analytics System
### Walchand Institute of Technology, Solapur

> Privacy-preserving, timetable-aware lab monitoring system.  
> Python Windows agent → AWS serverless backend → React analytics dashboard.

---

## Quick Start

### 1. Dashboard (mock data — no AWS needed)
```powershell
cd dashboard
npm install
npm run dev
# Visit http://localhost:5173
# Login: admin@wit.ac.in / Admin@123
#        faculty@wit.ac.in / Faculty@123
```

### 2. AWS Backend Setup (requires AWS CLI)
```powershell
# Install AWS CLI (if not done)
winget install Amazon.AWSCLI

# Install SAM CLI
winget install Amazon.SAM-CLI

# Configure credentials
aws configure
# Enter: Access Key ID, Secret Access Key, Region (ap-south-1), Output (json)

# Build and deploy
cd backend
sam build
sam deploy --guided
# Stack name: labpulse
# Region: ap-south-1
# Save config: Y

# Note the outputs: ApiUrl, CognitoUserPoolId, CognitoClientId

# Seed initial data
python seed_data.py --region ap-south-1
```

### 3. Python Agent (on lab PCs)
```powershell
# Install dependencies
cd agent
pip install -r requirements.txt

# Edit config.json (copy from config.json.example)
# Set: machine_id, lab_id, api_base_url (from sam deploy output), api_key

# Test run
python src/main.py

# Build executable (for deployment)
pyinstaller --onefile --noconsole --name labpulse src/main.py

# Install on lab PC (run as Administrator)
.\install.ps1 -InstallDir "C:\LabPulse" -ConfigFile ".\config.json"
```

---

## Project Structure
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
│   ├── install.ps1     PowerShell installer + Scheduled Task
│   └── requirements.txt
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
│       ├── pages/      11 pages (Overview, Labs, Machines, Students, Compliance, ...)
│       ├── components/ Shared UI components
│       ├── data/       Mock data (swap for API calls after AWS deploy)
│       └── auth/       Auth context (mock → real Cognito)
│
└── docs/               Planning documents (PRD, TRD, App Flow, etc.)
```

---

## Connect Dashboard to Real AWS Backend

After `sam deploy`, update `dashboard/src/api/apiClient.js`:
```js
const BASE_URL = "https://YOUR_API_GATEWAY_URL/v1";  // from sam deploy output
```

And update `.env`:
```
VITE_API_BASE_URL=https://YOUR_API_GATEWAY_URL/v1
VITE_COGNITO_USER_POOL_ID=ap-south-1_XXXXXX
VITE_COGNITO_CLIENT_ID=XXXXXXXXXXXXXXXXXX
VITE_AWS_REGION=ap-south-1
```

---

## Privacy Guarantee
- ❌ Never stored: passwords, raw keystrokes, key values, screenshots, URLs, window text
- ✅ Stored: app names, durations, input counts, idle intervals, college IDs, timestamps
- 🔒 API keys stored as SHA-256 hashes only; shown once at registration
- 🔒 All communication over HTTPS; DynamoDB encrypted at rest

---

## AWS Free Tier Usage
| Service | Usage | Free Tier Limit |
|---|---|---|
| DynamoDB | On-demand, <1M requests/month | 25 GB storage, 1M requests/month |
| Lambda | ~1000 invocations/day | 1M invocations/month |
| API Gateway | HTTP API | 1M calls/month |
| Cognito | <50 faculty users | 50,000 MAU |

---

## Technology Stack
| Component | Stack |
|---|---|
| Windows Agent | Python 3.11+, pywin32, psutil, pynput, tkinter |
| Backend | AWS SAM, Lambda (Python 3.12), DynamoDB, API Gateway, Cognito |
| Dashboard | React 18, Vite, Tailwind CSS 3, Recharts, React Router 6 |
