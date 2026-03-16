# Smart Scheduler — Setup Guide

Complete step-by-step setup for all external services.

## 1. Google Workspace (Free Trial)

### 1.1 Activate Workspace Trial
1. Go to https://workspace.google.com/
2. Click "Start free trial"
3. Use your existing domain
4. Create your admin account (e.g., admin@yourdomain.com)
5. Verify domain ownership (DNS TXT record)

### 1.2 Create Demo Users
In Google Admin Console (admin.google.com):
1. Go to Directory → Users → Add new user
2. Create:
   - `jashan@yourdomain.com` (primary user)
   - `alice@yourdomain.com` (participant)
   - `bob@yourdomain.com` (participant)

### 1.3 Populate Demo Calendars
Log into each account and add realistic events for the current week:

**jashan@yourdomain.com:**
- Monday 9:00-9:30 — "Daily Standup"
- Monday 11:00-12:00 — "Product Review"
- Tuesday 10:00-11:00 — "Design Sync"
- Tuesday 14:00-15:00 — "Sprint Planning"
- Wednesday 9:00-9:30 — "Daily Standup"
- Wednesday 13:00-14:00 — "Lunch with Client"
- Thursday 10:00-11:30 — "Project Alpha Kickoff"
- Thursday 15:00-16:00 — "One-on-one with Manager"
- Friday 9:00-9:30 — "Daily Standup"
- Friday 18:00-21:00 — "Flight to NYC" (for "before my flight" test case)

**alice@yourdomain.com:**
- Monday 10:00-11:00 — "Marketing Sync"
- Tuesday 9:00-10:00 — "Team Standup"
- Tuesday 14:00-15:30 — "Content Planning"
- Wednesday 11:00-12:00 — "Design Review"
- Thursday 10:00-11:30 — "Project Alpha Kickoff"
- Friday 13:00-14:00 — "Weekly Retro"

**bob@yourdomain.com:**
- Monday 14:00-15:00 — "Engineering Standup"
- Tuesday 11:00-12:00 — "Architecture Review"
- Wednesday 9:00-10:30 — "Sprint Review"
- Thursday 10:00-11:30 — "Project Alpha Kickoff"
- Thursday 14:00-15:00 — "Code Review"
- Friday 10:00-11:00 — "Team Sync"

---

## 2. Google Cloud Platform (GCP)

### 2.1 Create Project
1. Go to https://console.cloud.google.com/
2. Create new project: "smart-scheduler"
3. Enable billing (required even for free tier)

### 2.2 Enable APIs
```bash
gcloud services enable calendar-json.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable artifactregistry.googleapis.com
```

### 2.3 Create Service Account
```bash
gcloud iam service-accounts create smart-scheduler \
  --display-name="Smart Scheduler Service Account"
```

### 2.4 Download Service Account Key
```bash
gcloud iam service-accounts keys create service-account-key.json \
  --iam-account=smart-scheduler@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

### 2.5 Enable Domain-Wide Delegation
1. Go to GCP Console → IAM → Service Accounts
2. Click on the smart-scheduler service account
3. Click "Show domain-wide delegation" → Enable
4. Copy the Client ID (you'll need it for the next step)

### 2.6 Authorize in Google Workspace Admin
1. Go to admin.google.com
2. Security → Access and data control → API controls
3. Click "Manage Domain Wide Delegation"
4. Click "Add new"
5. Client ID: paste from step 2.5
6. OAuth Scopes: `https://www.googleapis.com/auth/calendar`
7. Click "Authorize"

⚠️ This can take up to 24 hours to propagate, but usually works within minutes.

---

## 3. ElevenLabs

### 3.1 Create Account
1. Go to https://elevenlabs.io/
2. Sign up / sign in
3. You need at least the Starter plan ($5/mo) for Conversational AI

### 3.2 Create Agent
1. Go to https://elevenlabs.io/app/conversational-ai
2. Click "Create Agent"
3. Name: "Smart Scheduler"

### 3.3 Configure Agent — LLM
1. Under "Model", select **GPT-4o**
2. Set max tokens to 300 (keeps responses concise)

### 3.4 Configure Agent — System Prompt
Paste the system prompt from `src/lib/system-prompt.ts` (the SYSTEM_PROMPT constant, without the backticks).

### 3.5 Configure Agent — First Message
Set to: `Hey! I'm Ava, your scheduling assistant. What can I help you with?`

### 3.6 Configure Agent — Voice
1. Go to Voice settings
2. Browse voices and pick a natural, warm female voice (to match "Ava")
3. Recommended: "Rachel" or "Aria" — clear, professional, warm
4. Set stability to 0.5, similarity boost to 0.8

### 3.7 Configure Agent — Server Tools
For each tool below, click "Add Tool" → Select "Webhook":

**Tool 1: find_available_slots**
- URL: `https://YOUR_CLOUD_RUN_URL/api/calendar/find-slots`
- Method: POST
- Description: (copy from TOOL_DEFINITIONS in system-prompt.ts)
- Add all parameters with types and descriptions from TOOL_DEFINITIONS

**Tool 2: check_availability**
- URL: `https://YOUR_CLOUD_RUN_URL/api/calendar/availability`
- Method: POST

**Tool 3: list_events**
- URL: `https://YOUR_CLOUD_RUN_URL/api/calendar/list-events`
- Method: POST

**Tool 4: search_event**
- URL: `https://YOUR_CLOUD_RUN_URL/api/calendar/search-event`
- Method: POST

**Tool 5: create_event**
- URL: `https://YOUR_CLOUD_RUN_URL/api/calendar/create-event`
- Method: POST

**Tool 6: update_event**
- URL: `https://YOUR_CLOUD_RUN_URL/api/calendar/update-event`
- Method: POST

**Tool 7: delete_event**
- URL: `https://YOUR_CLOUD_RUN_URL/api/calendar/delete-event`
- Method: POST

**Tool 8: calendar_summary**
- URL: `https://YOUR_CLOUD_RUN_URL/api/calendar/summary`
- Method: POST

**Tool 9: resolve_date**
- URL: `https://YOUR_CLOUD_RUN_URL/api/calendar/resolve-date`
- Method: POST

### 3.8 Get Agent ID and API Key
1. Agent ID: visible in the agent settings URL or overview page
2. API Key: Go to Profile → API Keys → Create new key
3. Save both for your .env file

---

## 4. Deploy to Cloud Run

### 4.1 Create .env file
```bash
cp .env.example .env
# Edit .env with your actual values
```

### 4.2 Create Artifact Registry repository
```bash
gcloud artifacts repositories create smart-scheduler \
  --repository-format=docker \
  --location=us-central1
```

### 4.3 Build and push Docker image
```bash
# Configure Docker auth
gcloud auth configure-docker us-central1-docker.pkg.dev

# Build
docker build -t us-central1-docker.pkg.dev/YOUR_PROJECT_ID/smart-scheduler/app:latest .

# Push
docker push us-central1-docker.pkg.dev/YOUR_PROJECT_ID/smart-scheduler/app:latest
```

### 4.4 Deploy to Cloud Run
```bash
gcloud run deploy smart-scheduler \
  --image=us-central1-docker.pkg.dev/YOUR_PROJECT_ID/smart-scheduler/app:latest \
  --region=us-central1 \
  --platform=managed \
  --allow-unauthenticated \
  --min-instances=1 \
  --max-instances=3 \
  --memory=512Mi \
  --set-env-vars="ELEVENLABS_API_KEY=your_key,ELEVENLABS_AGENT_ID=your_agent_id,NEXT_PUBLIC_USER_1_EMAIL=jashan@yourdomain.com,NEXT_PUBLIC_USER_1_NAME=Jashan,NEXT_PUBLIC_USER_2_EMAIL=alice@yourdomain.com,NEXT_PUBLIC_USER_2_NAME=Alice,NEXT_PUBLIC_USER_3_EMAIL=bob@yourdomain.com,NEXT_PUBLIC_USER_3_NAME=Bob" \
  --set-secrets="GOOGLE_SERVICE_ACCOUNT_KEY=smart-scheduler-sa-key:latest"
```

### 4.5 Store service account key in Secret Manager
```bash
gcloud secrets create smart-scheduler-sa-key \
  --data-file=service-account-key.json
```

### 4.6 Update ElevenLabs webhook URLs
Once deployed, get your Cloud Run URL:
```bash
gcloud run services describe smart-scheduler --region=us-central1 --format='value(status.url)'
```
Go back to ElevenLabs and update all 9 server tool URLs with this base URL.

---

## 5. Verify

### 5.1 Test Calendar API
```bash
curl -X POST https://YOUR_CLOUD_RUN_URL/api/calendar/list-events \
  -H "Content-Type: application/json" \
  -d '{"user_email":"jashan@yourdomain.com","date_start":"2024-03-15","date_end":"2024-03-22"}'
```

### 5.2 Test the voice agent
1. Open https://YOUR_CLOUD_RUN_URL in your browser
2. Select your user from the dropdown
3. Click the microphone button
4. Say "I need to schedule a meeting"
5. Follow the conversation

### 5.3 Test scenarios for demo
1. Basic scheduling: "Schedule a 30-minute meeting for tomorrow afternoon"
2. Multi-participant: "Set up a meeting with Alice and Bob next Tuesday"
3. Rescheduling: "Move my sprint planning to Wednesday at 3"
4. Cancellation: "Cancel my lunch with client on Wednesday"
5. Calendar intelligence: "Am I overbooked this week?"
6. Event-relative: "Schedule something an hour before my flight on Friday"
7. Complex dates: "Find a time on the last weekday of this month"
8. Conflict resolution: "I need a meeting with Alice on Thursday morning" (should conflict with Project Alpha Kickoff)
9. Mid-conversation change: "Actually, make it an hour instead of 30 minutes"
