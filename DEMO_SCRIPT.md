# Demo Video Script — Smart Scheduler

**Target duration:** 2:30–3:00 minutes
**Format:** Screen recording with voiceover narration + agent audio audible
**Rule:** All narration happens BEFORE or AFTER agent interactions, never during. When the agent is active, only your voice talking TO the agent is heard.

---

## PRE-RECORDING CHECKLIST

- [ ] Calendars populated with demo events (see SETUP.md section 1.3)
- [ ] App deployed and running on Cloud Run
- [ ] Browser open at the landing page
- [ ] Mic working, quiet room
- [ ] Screen recording tool ready (OBS / QuickTime)
- [ ] Personal Google account ready for OAuth demo (with some existing calendar events)

---

## SCENE 1 — Intro + Architecture (0:00–0:20)

**[Screen: Landing page showing "Personal" and "Organization Demo" cards]**

> "This is Smart Scheduler — a voice-first AI agent that manages Google Calendar through natural conversation. The user speaks, ElevenLabs handles speech-to-text and text-to-speech, GPT-4o — hosted directly inside ElevenLabs — decides what to do, and calls our Next.js backend via webhooks when it needs calendar data. There's no custom LLM server — our backend is purely a calendar operations layer."

---

## SCENE 2 — Personal Flow (0:20–0:55)

> "First, the personal mode. Any user can sign in with their own Google account and manage their calendar."

**[Click "Personal" card. Google OAuth consent screen appears. Sign in with your Google account. Redirect back to the app. Calendar sidebar loads with your real events.]**

> "That's a standard OAuth flow — the app gets calendar access, stores tokens securely in Firestore, and auto-refreshes them. Now let me schedule something."

**[Click microphone button. Wait for agent greeting.]**

**[Agent: "Hey! I'm Ava, your scheduling assistant. What can I help you with?"]**

**YOU SAY:** "Schedule a thirty-minute meeting for tomorrow morning."

**[Agent checks calendar, presents available slots.]**

**YOU SAY:** *(Pick one of the offered times)* "The ten o'clock one."

**[Agent confirms with full date.]**

**YOU SAY:** "Yes."

**[Agent books it. Calendar sidebar updates with the new event.]**

**[End conversation. Click the stop button.]**

> "That's the personal flow — OAuth sign-in, voice scheduling, real-time calendar updates. Now for the above-and-beyond features. I built multi-participant scheduling across an organization using Google Workspace with domain-wide delegation. The team directory is hard-coded for this demo, but in production this would plug into a company directory. Let me show it."

---

## SCENE 3 — Org Mode: Full Showcase (0:55–2:25)

**[Navigate back to landing page. Click "Organization Demo". Org page loads with user selector showing "Jashan". Calendar sidebar shows pre-populated events.]**

> "In org mode, a service account accesses any calendar in the Workspace domain — no individual OAuth needed. I'll run through the major test cases in one conversation."

**[Click microphone button. Wait for agent greeting.]**

**[Agent: "Hey! I'm Ava, your scheduling assistant. What can I help you with?"]**

### Part A — Basic scheduling + mid-conversation change + multi-participant + conflict resolution

**YOU SAY:** "Find me a thirty-minute slot for Tuesday morning."

**[Agent calls find_available_slots, presents options.]**

**YOU SAY:** "Actually, my colleague Deepak needs to join, so we'll need a full hour. Are any of those times still available for an hour?"

**[Agent re-runs search with new duration + Deepak's calendar via FreeBusy. Either confirms or suggests alternatives.]**

**YOU SAY:** *(Pick from what agent offers.)* "Sounds good, book it."

**[Agent books. Calendar sidebar updates.]**

### Part B — Event-relative scheduling

**YOU SAY:** "I also need a forty-five minute meeting before my flight on Friday."

**[Agent searches calendar for "flight" event, finds it at 6 PM, then finds available slots before it.]**

**YOU SAY:** *(Pick a time.)* "The one right before the flight."

**[Agent confirms and books. Calendar sidebar updates.]**

### Part C — Complex date parsing

**YOU SAY:** "Can you also find a time on the last weekday of this month?"

**[Agent resolves the date expression, then finds available slots on that day.]**

**YOU SAY:** *(Pick a time, confirm.)*

**[Agent books. Calendar sidebar updates.]**

### Part D — Calendar intelligence

**YOU SAY:** "Am I overbooked this week?"

**[Agent analyzes calendar — reports meeting count, total hours, busiest day, back-to-back warnings.]**

### Part E — Cancellation

**YOU SAY:** "Cancel my lunch with client on Wednesday."

**[Agent searches for the event, confirms title and time.]**

**YOU SAY:** "Yes, cancel it."

**[Agent deletes. Calendar sidebar updates — event disappears.]**

**[End conversation. Click the stop button.]**

> "All of that in one conversation — scheduling with a mid-conversation change, multi-participant coordination, event-relative booking, complex date resolution, calendar intelligence, and cancellation."

---

## SCENE 4 — Wrap-Up (2:25–2:50)

**[Show the calendar sidebar with all changes reflected.]**

> "Here's how this was built. ElevenLabs Conversational AI handles the entire voice pipeline — STT, TTS, and turn-taking — and hosts GPT-4o directly, so there's no separate LLM server to manage. Our Next.js backend exposes nine webhook endpoints that ElevenLabs calls as server tools — things like find-slots, create-event, delete-event, calendar-summary. Google Calendar API with domain-wide delegation handles the actual calendar operations across multiple users. The frontend is React with a live week-view calendar that updates via Server-Sent Events as the agent makes changes. Everything's deployed on Cloud Run. Thanks for watching."

---

## EVALUATION CRITERIA COVERAGE MAP

| Evaluation Criterion | Where in Demo |
|---|---|
| **Agentic Logic** — multi-turn context, knows when to ask vs. call API | Scene 3A (retains day, re-checks with changed params across turns) |
| **Prompt Engineering** — guides conversation quality | Throughout — concise spoken responses, confirmation gates, natural fillers |
| **Coding & API Integration** — Google Calendar auth and correct usage | Scene 2 (OAuth + create), Scene 3A (domain-wide delegation + FreeBusy), Scene 3E (delete) |
| **Voice-Enabled Agent** — natural speech, <800ms latency | Every scene — live voice conversation |
| **Advanced Conflict Resolution** — graceful when slots unavailable | Scene 3A (duration + participant change forces re-check and alternatives) |
| **Smarter Time Parsing** — complex/ambiguous requests | Scene 3A ("Tuesday morning"), Scene 3B ("before my flight"), Scene 3C ("last weekday of this month") |
| **Problem Solving** — overall approach | Architecture (Scene 1), two auth modes (Scenes 2-3), build overview (Scene 4) |
| **Above & Beyond** — innovative features | Multi-participant (3A), calendar intelligence (3D), live visualization (all), event-relative (3B), two modes (1-2) |

## ASSIGNMENT TEST CASES COVERED

| Test Case from Assignment | Demo Scene |
|---|---|
| "45 minutes before my flight on Friday at 6 PM" | Scene 3B |
| "Last weekday of this month" | Scene 3C |
| "Find a 30-min slot → colleague joining, need a full hour" | Scene 3A (exact scenario) |
| Conflict resolution — suggest alternatives when booked | Scene 3A |
| Multi-turn context retention | Scene 3A–E (single conversation) |
| Voice with natural, <800ms latency | All scenes |
| "Am I overbooked this week?" (calendar intelligence) | Scene 3D |
| Event cancellation with search + confirm | Scene 3E |
| OAuth personal flow | Scene 2 |
| Multi-user org flow with domain-wide delegation | Scene 3 |

---

## TIPS FOR RECORDING

1. **All narration happens when the agent is NOT active** — before clicking mic, or after ending conversation
2. **Speak clearly and at normal pace** to the agent — it needs clean audio
3. **Pause 1 second after the agent finishes** before speaking — avoids turn-taking glitches
4. **If the agent misunderstands**, correct naturally ("No, I said Tuesday") — this actually demonstrates robustness
5. **Do a full dry run first** — confirm all demo events are in calendars and the agent responds as expected
6. **Keep the calendar sidebar visible at all times** — the real-time updates are a strong visual proof point
7. **For personal flow**, use an account that has some existing events so the calendar isn't empty
8. **Scene 3 is one continuous conversation** — do NOT end and restart between parts A-E
