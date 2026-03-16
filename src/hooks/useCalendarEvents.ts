"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { startOfWeek, addDays, format } from "date-fns";
import type { CalendarEvent, AvailableSlot } from "@/lib/types";

const POLL_INTERVAL = 5000;

export function useCalendarEvents(userEmail: string, weekOffset: number = 0) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [highlightedSlots, setHighlightedSlots] = useState<AvailableSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const { weekStartStr, weekEndStr } = useMemo(() => {
    if (!mounted) return { weekStartStr: "", weekEndStr: "" };
    const now = new Date();
    const monday = startOfWeek(now, { weekStartsOn: 1 });
    const start = addDays(monday, weekOffset * 7);
    const end = addDays(start, 6); // Sunday

    return {
      weekStartStr: format(start, "yyyy-MM-dd"),
      weekEndStr: format(end, "yyyy-MM-dd"),
    };
  }, [mounted, weekOffset]);

  const fetchEvents = useCallback(
    async (silent = false) => {
      if (!userEmail || !mounted || !weekStartStr) return;

      if (!silent) setLoading(true);
      try {
        const response = await fetch("/api/calendar/list-events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_email: userEmail,
            date_start: weekStartStr,
            date_end: weekEndStr,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        });

        const data = await response.json();
        if (data.success) {
          const newEvents: CalendarEvent[] = data.events;

          setEvents(newEvents);
        }
      } catch (error) {
        console.error("[Calendar] Failed to fetch events:", error);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [userEmail, mounted, weekStartStr, weekEndStr]
  );

  // Initial fetch
  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Poll for changes (handles live updates when events are created/updated/deleted via voice)
  useEffect(() => {
    if (!mounted || !userEmail) return;

    const interval = setInterval(() => {
      fetchEvents(true);
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [mounted, userEmail, fetchEvents]);

  return {
    events,
    highlightedSlots,
    loading,
    refetchEvents: () => fetchEvents(),
    clearHighlights: () => setHighlightedSlots([]),
  };
}
