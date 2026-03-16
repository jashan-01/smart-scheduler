# Smart Scheduler — AI Voice Scheduling Agent

A voice-first AI agent that manages Google Calendar through natural conversation. Talk to schedule, reschedule, cancel, and analyze meetings — including multi-participant coordination across an organization.

**Demo video:** [Watch on Google Drive](https://drive.google.com/file/d/1eGj28IGMPbh2mUhLgv4_Xkp_IEVMGE_n/view?usp=sharing)

**Live deployment:** [smart-scheduler-377865870788.us-central1.run.app](https://smart-scheduler-377865870788.us-central1.run.app/)

---

## How It Works

```
User speaks
  → ElevenLabs STT (speech-to-text)
  → GPT-4o (hosted by ElevenLabs, not a custom server)
  → Tool call decision
  → Webhook to our Next.js API (Cloud Run)
  → Google Calendar API
  → Result back to GPT-4o
  → ElevenLabs TTS (text-to-speech)
→ User hears the response
```

The user speaks naturally. ElevenLabs handles speech recognition and synthesis. GPT-4o decides what to do and calls our backend via webhooks when it needs calendar data. Our backend is purely a calendar operations layer — no LLM hosting, no inference, no prompt routing.

---

## Design Choices

### Why ElevenLabs Conversational AI as the voice layer?

ElevenLabs provides an end-to-end voice pipeline: STT, turn-taking, and TTS in one service. The key advantage is that it **hosts GPT-4o directly** and calls our backend via webhooks (server tools) only when tool execution is needed. This eliminates an entire custom LLM server from the architecture.

Alternatives considered:
- **OpenAI Realtime API**: Higher latency (~200ms TTS vs ElevenLabs' ~75ms), lower function calling accuracy (66.5% vs 80%), and locks you into OpenAI's voice model.
- **Custom STT + LLM + TTS pipeline** (e.g., Whisper + GPT-4o + Play.ht): More control but significantly more infrastructure, higher latency from multiple hops, and no built-in turn-taking.

ElevenLabs gave us the best voice quality with the least infrastructure.

### Why webhooks (server tools) instead of a custom LLM server?

ElevenLabs supports two integration modes: (1) bring your own LLM server, or (2) use their hosted LLM with webhook-based tools.

We chose webhooks. The LLM runs inside ElevenLabs' infrastructure, and when it decides to call a tool (e.g., `find_available_slots`), ElevenLabs sends a POST request to our API endpoint. Our backend never sees the conversation — it only processes discrete calendar operations. This reduces end-to-end latency and simplifies deployment to a single Next.js app.

### Why Google Calendar with domain-wide delegation?

The demo involves scheduling across multiple users (Jashan, Deepak, Monica). Domain-wide delegation lets a single service account access any calendar in the Google Workspace domain without per-user OAuth flows. This is the same pattern enterprise tools like Calendly and Reclaim use. The app also supports a personal OAuth mode for individual users outside the Workspace domain.

### Prompt engineering for voice

Voice agents have different constraints than chat. The system prompt enforces:
- **40-word response limit** — spoken responses must be concise
- **Single question per turn** — stacking questions confuses listeners
- **Spelled-out numbers** — "two thirty" not "2:30" for TTS clarity
- **Natural fillers** — "one sec, let me check" before tool calls so the user doesn't hear dead air
- **Strict tool discipline** — the agent can ONLY suggest times returned by `find_available_slots`, never guess or calculate times itself. This is the most important guardrail and is reinforced multiple times in the prompt.

---

## Architecture

| Layer | Technology | Why |
|-------|-----------|-----|
| Voice | ElevenLabs Conversational AI | Best-in-class STT + TTS with hosted LLM |
| LLM | GPT-4o (via ElevenLabs) | Strong function calling, fast reasoning |
| Backend | Next.js 16 API routes (TypeScript) | Single deployable, great DX |
| Frontend | React 19 + Tailwind CSS v4 | Week-view calendar + voice UI |
| Calendar | Google Calendar API | Domain-wide delegation + OAuth |
| Auth tokens | Firestore | Secure OAuth token persistence |
| Real-time UI | Server-Sent Events | Live calendar updates on event changes |
| Hosting | Google Cloud Run | Scales to zero, pairs with GCP services |

### Backend: 9 webhook endpoints

Each is a standalone POST handler that ElevenLabs calls as a "server tool":

| Endpoint | Purpose |
|----------|---------|
| `find-slots` | Finds conflict-free meeting times across all participants |
| `availability` | Raw FreeBusy check (informational, not for booking) |
| `list-events` | Lists events in a date range |
| `search-event` | Finds events by title keyword |
| `create-event` | Books a meeting and sends invitations |
| `update-event` | Reschedules, extends, or renames an event |
| `delete-event` | Cancels an event and notifies attendees |
| `summary` | Workload analysis (meeting hours, overbooking, busiest day) |
| `resolve-date` | Converts "last weekday of June" → concrete date |

### Frontend: voice + calendar

Two-panel layout:
- **Left**: voice interface with microphone button, real-time audio visualizer (frequency bars), live conversation transcript, and connection status
- **Right**: interactive week-view calendar (8 AM–9 PM, 15-min grid) that shows events color-coded with available slots highlighted as green dashed boxes

---

## What the Agent Can Do

### Core capabilities
- **Schedule meetings** — "Schedule a one-hour meeting for Tuesday afternoon"
- **Multi-participant scheduling** — "Set up a meeting with Deepak and Monica next week" → checks all calendars simultaneously via FreeBusy API, returns only overlapping free slots
- **Conflict resolution** — When the requested time is taken, presents alternatives from nearby times/days
- **Reschedule** — "Move my sprint planning to Wednesday at three"
- **Cancel** — "Cancel my lunch with client on Wednesday"
- **Calendar intelligence** — "Am I overbooked this week?" → meeting count, total hours, free hours, busiest day, back-to-back warnings

### Smart behaviors
- **Vague time handling** — "sometime next week, not too early, not on Wednesday" → searches Mon-Fri after 9 AM, excluding Wednesday
- **Event-relative scheduling** — "an hour before my flight on Friday" → finds the flight event, calculates offset, searches around that time
- **Complex date expressions** — "last weekday of this month" → resolves to concrete date via NLP date parser
- **Mid-conversation changes** — "actually, make it an hour instead" → re-checks availability with new duration
- **Back-to-back awareness** — warns if a slot is immediately after another meeting with no break

---

## Above & Beyond

Beyond the core assignment requirements:

1. **Multi-participant scheduling** — Checks multiple calendars simultaneously using Google's FreeBusy API. Merges busy intervals across all participants and finds only overlapping free slots. This required implementing interval merging, gap detection, and ranked slot selection.

2. **Intelligent slot scoring** — Slots aren't just free/busy. They're ranked by proximity to peak productivity hours (10 AM, 2 PM), penalized for being outside working hours, and filtered by user preferences (morning/afternoon/evening). The result: the best slots surface first, not just the earliest.

3. **Timezone-safe architecture** — Cloud Run runs in UTC. Users are in Asia/Kolkata. All slot calculations use epoch-millisecond arithmetic with timezone-aware conversions (`fromZonedTime`/`toZonedTime`), and datetime strings are formatted as bare local times with separate timezone fields. This prevents the common bug where `new Date()` silently shifts times by the server's offset.

4. **Two operating modes** — Personal mode (Google OAuth for any user) and Organization demo mode (pre-configured Workspace users with domain-wide delegation). The app detects which auth method to use per-user.

5. **Live calendar visualization** — The week-view calendar updates in real-time as the agent creates, moves, or deletes events. SSE broadcasts from the backend + polling ensure the sidebar reflects the current state.

6. **Calendar workload analysis** — `calendar_summary` computes meeting hours, free hours, busiest day, back-to-back meeting count, and overbooking status (>70% of working hours in meetings).

7. **Natural language date resolution** — A custom NLP date parser handles "late next week" (Thursday-Friday), "last weekday of June" (walk backward from month-end to skip weekends), "the morning of June twentieth," etc.

---

## Known Limitations & Improvement Scope

- **Team directory is hard-coded** — The system prompt maps names to emails for 3 users. A production system would integrate with a company directory (Google Workspace Admin SDK, LDAP, etc.).
- **Single timezone** — The default timezone is Asia/Kolkata. While the architecture supports arbitrary IANA timezones, the prompt defaults to one. Cross-timezone scheduling (e.g., "schedule at 2 PM their time") would need timezone resolution logic.
- **No recurring events** — The agent handles one-off events only. Recurring meeting support would require additional Google Calendar API parameters and UI for recurrence patterns.
- **No calendar permission scoping** — Domain-wide delegation grants full calendar access. A production deployment should use constrained OAuth scopes and consent screens.
- **SSE scalability** — The SSE broadcaster is an in-memory singleton. With multiple Cloud Run instances, events broadcast on one instance aren't visible on others. A production setup would use Redis Pub/Sub or Cloud Pub/Sub.
- **Prompt reliability** — Despite strong guardrails, LLMs occasionally hallucinate times not returned by tools. The confirmation gate (user must say "yes" before booking) is the safety net, but a backend validation layer could reject invalid times entirely.
- **No persistent conversation history** — Each voice session starts fresh. Conversation memory across sessions (e.g., "reschedule the meeting we booked yesterday") would improve UX.

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                         # Landing: Personal vs Org mode
│   ├── personal/page.tsx                # OAuth personal mode
│   ├── org/page.tsx                     # Demo mode with user switcher
│   └── api/
│       ├── calendar/                    # 9 webhook endpoints
│       │   ├── find-slots/route.ts
│       │   ├── availability/route.ts
│       │   ├── list-events/route.ts
│       │   ├── search-event/route.ts
│       │   ├── create-event/route.ts
│       │   ├── update-event/route.ts
│       │   ├── delete-event/route.ts
│       │   ├── summary/route.ts
│       │   └── resolve-date/route.ts
│       ├── events/stream/route.ts       # SSE for live UI updates
│       └── auth/
│           ├── elevenlabs-token/route.ts
│           ├── google/login/route.ts
│           ├── google/callback/route.ts
│           ├── session/route.ts
│           └── logout/route.ts
├── lib/
│   ├── google-calendar.ts               # Calendar API client + slot finder
│   ├── system-prompt.ts                 # Agent prompt + 9 tool definitions
│   ├── date-resolver.ts                 # NLP date parsing
│   ├── oauth-store.ts                   # Firestore token management
│   ├── firestore.ts                     # Firebase Admin init
│   ├── sse.ts                           # SSE broadcaster
│   └── types.ts                         # TypeScript interfaces
├── components/
│   ├── VoiceInterface.tsx               # Mic button + transcript + visualizer
│   ├── CalendarSidebar.tsx              # Week-view calendar grid
│   ├── AudioVisualizer.tsx              # Real-time frequency bars
│   ├── TranscriptPanel.tsx              # Conversation transcript
│   ├── StatusIndicator.tsx              # Connection state indicator
│   └── UserSelector.tsx                 # Org mode user switcher
└── hooks/
    ├── useElevenLabs.ts                 # ElevenLabs SDK wrapper
    └── useCalendarEvents.ts             # Calendar polling + SSE state
```

---

## Setup

See [SETUP.md](SETUP.md) for detailed instructions covering:
1. Google Workspace trial + demo user creation
2. GCP project, service account, domain-wide delegation
3. ElevenLabs agent configuration (LLM, system prompt, 9 server tools)
4. Cloud Run deployment

### Quick start (local)

```bash
npm install
cp .env.example .env   # fill in all values
npm run dev
```

### Environment variables

| Variable | Description |
|----------|-------------|
| `ELEVENLABS_API_KEY` | ElevenLabs API key |
| `ELEVENLABS_AGENT_ID` | ElevenLabs agent ID |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | GCP service account JSON (single-line string) |
| `GOOGLE_OAUTH_CLIENT_ID` | OAuth client ID (personal mode) |
| `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth client secret |
| `NEXT_PUBLIC_APP_URL` | Base URL of the deployed app |
| `GOOGLE_CLOUD_PROJECT` | GCP project ID (Firestore) |
| `NEXT_PUBLIC_USER_[1-3]_EMAIL` | Demo user emails |
| `NEXT_PUBLIC_USER_[1-3]_NAME` | Demo user names |
