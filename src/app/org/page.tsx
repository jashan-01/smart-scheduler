"use client";

import { useState } from "react";
import { VoiceInterface } from "@/components/VoiceInterface";
import { CalendarSidebar } from "@/components/CalendarSidebar";
import { UserSelector } from "@/components/UserSelector";
import { useCalendarEvents } from "@/hooks/useCalendarEvents";

// Demo users - will be configured via env vars in production
const DEMO_USERS = [
  {
    email: process.env.NEXT_PUBLIC_USER_1_EMAIL || "jashan@example.com",
    name: process.env.NEXT_PUBLIC_USER_1_NAME || "Jashan",
  },
  {
    email: process.env.NEXT_PUBLIC_USER_2_EMAIL || "alice@example.com",
    name: process.env.NEXT_PUBLIC_USER_2_NAME || "Alice",
  },
  {
    email: process.env.NEXT_PUBLIC_USER_3_EMAIL || "bob@example.com",
    name: process.env.NEXT_PUBLIC_USER_3_NAME || "Bob",
  },
];

export default function Home() {
  const [selectedUser, setSelectedUser] = useState(DEMO_USERS[0].email);
  const [weekOffset, setWeekOffset] = useState(0);
  const selectedUserData = DEMO_USERS.find((u) => u.email === selectedUser)!;

  const { events, highlightedSlots, loading, refetchEvents } =
    useCalendarEvents(selectedUser, weekOffset);

  return (
    <div className="h-screen bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden">
      {/* Top bar */}
      <header className="h-14 border-b border-zinc-800 flex items-center justify-between px-5 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <svg
              className="w-4 h-4 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h1 className="text-sm font-semibold tracking-tight">
            Smart Scheduler
          </h1>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-600/20 text-indigo-400 font-medium">
            AI
          </span>
        </div>

        <div className="flex items-center gap-3">
          <UserSelector
            users={DEMO_USERS}
            selectedUser={selectedUser}
            onSelectUser={setSelectedUser}
          />
          <button
            onClick={refetchEvents}
            className="p-2 rounded-lg hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-zinc-200"
            title="Refresh calendar"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left panel - Voice interface */}
        <div className="flex-1 flex flex-col border-r border-zinc-800 min-w-0">
          <VoiceInterface
            userEmail={selectedUser}
            userName={selectedUserData.name}
          />
        </div>

        {/* Right panel - Calendar */}
        <div className="w-[520px] flex-shrink-0 p-3">
          <CalendarSidebar
            events={events}
            highlightedSlots={highlightedSlots}
            loading={loading}
            weekOffset={weekOffset}
            onWeekOffsetChange={setWeekOffset}
          />
        </div>
      </main>
    </div>
  );
}
