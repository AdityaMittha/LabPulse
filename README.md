# LabPulse

Privacy-preserving computer lab usage analytics for Walchand Institute of Technology, Solapur.

Tracks which apps students use during lab sessions, how long they're active vs idle, and what sites they visit in the browser — without ever logging keystrokes, clipboard data, or taking screenshots. Built as a final-year B.E. project.

## Why this project?

WIT has ~35 lab PCs across 4 labs and no visibility into how they're actually used. Faculty couldn't answer basic questions like "are students using the IDE during the OS lab, or just browsing?" or "which PCs are sitting idle during scheduled sessions?". LabPulse fills that gap with a lightweight Windows agent that reports hourly summaries to the cloud, and a dashboard where faculty can see utilization trends, compliance rates, and browser activity — all without invading student privacy.

## Architecture

```
  ┌─────────────────┐        HTTPS         ┌──────────────────────────────┐
  │  Windows Agent   │ ──────────────────►  │  AWS API Gateway + Lambda    │
  │  (Python, Win32) │   hourly summaries   │  (validate, ingest, query)   │
  │                  │ ◄────────────────── │                              │
  │  tkinter login   │   session token      │  DynamoDB (8 tables)         │
  └─────────────────┘                       │  Cognito (faculty auth)      │
                                            └──────────────┬───────────────┘
                                                           │
                                            ┌──────────────▼───────────────┐
                                            │  React Dashboard (Vite)      │
                                            │  Overview · Labs · Compliance│
                                            │  Reports · Admin CRUD        │
                                            └──────────────────────────────┘
```

**Agent** — Runs on each lab PC. Shows a login prompt at Windows logon, then silently tracks foreground apps, input counts, idle time, and browser tabs. Sends hourly summaries over HTTPS. If the network is down, queues them locally in SQLite and retries later.

**Backend** — AWS SAM stack: API Gateway + 5 Lambda functions + 8 DynamoDB tables + Cognito user pool. The agent talks to unauthenticated endpoints (validated by machine API key), while the dashboard uses Cognito JWT tokens.

**Dashboard** — React + Vite + Tailwind. Faculty log in through Cognito (or mock auth for local dev). Shows lab utilization, per-machine drilldowns, student session history, timetable compliance, and browser activity breakdowns.

## Quick start (local dev)

```bash
cd dashboard
npm install
npm run dev
# http://localhost:5173
# admin@wit.ac.in / Admin@123   (mock auth, no backend needed)
# faculty@wit.ac.in / Faculty@123
```

To connect to the live AWS backend instead, create `dashboard/.env`:
```
VITE_API_BASE_URL=/v1
VITE_COGNITO_USER_POOL_ID=<your-pool-id>
VITE_COGNITO_CLIENT_ID=<your-client-id>
VITE_AWS_REGION=ap-south-1
```

## Deploying the agent on lab PCs

1. Register the machine in the admin dashboard → Admin → Machines. Copy the API key.
2. Download the agent pack from the sidebar ("Download Agent Pack").
3. Extract on the lab PC, open PowerShell as admin:
   ```powershell
   Set-ExecutionPolicy Bypass -Scope Process -Force
   .\install.ps1 -InstallDir "C:\LabPulse"
   ```
4. Edit `C:\LabPulse\config.json` with the machine ID, lab ID, and API key.
5. Log out and back in — the agent starts automatically via Scheduled Task.

See `agent/config.json.example` for the full config schema.

## Deploying the backend

Requires [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html):

```bash
cd backend
sam build
sam deploy --guided
python seed_data.py --profile default --region ap-south-1
```

The seed script creates sample machines, students, and timetable entries. API keys are written to `machine_api_keys.json` (gitignored — don't commit this).

## Privacy

What the agent records:
- Application names and active durations (e.g. `code.exe` for 45 min)
- Keyboard/mouse event *counts* (not the actual keys pressed)
- Active vs idle time
- Browser page titles, URLs, and per-domain visit stats
- Session login/logout timestamps

What it **never** records:
- Individual keystrokes or typed text
- Clipboard contents
- Screenshots or screen recordings

All data is sent over HTTPS. DynamoDB tables are encrypted at rest with AWS KMS.

## Repo structure

```
agent/           Python Windows agent (Win32 API + pynput + tkinter)
  src/           main, tracker, summarizer, uploader, auth, config
  install.ps1    PowerShell installer (creates Scheduled Task)

backend/         AWS SAM stack
  functions/     Lambda handlers (validate, ingest, session-end, analytics, admin)
  template.yaml  CloudFormation template (DynamoDB, API GW, Cognito, Lambda)
  seed_data.py   Seeds initial lab data

dashboard/       React + Vite + Tailwind admin dashboard
  src/pages/     Overview, Labs, Machines, Students, Compliance, Reports, Admin
  src/auth/      Cognito auth with mock fallback
  src/api/       API client with proxy routing
```

## License

MIT
