"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import {
  format,
  addDays,
  isSameDay,
  parseISO,
  differenceInMinutes,
  startOfWeek,
} from "date-fns";

import type { CalendarEvent, AvailableSlot } from "@/lib/types";

interface CalendarSidebarProps {
  events: CalendarEvent[];
  highlightedSlots: AvailableSlot[];
  loading: boolean;
  weekOffset: number;
  onWeekOffsetChange: (offset: number) => void;
}

const HOUR_HEIGHT = 48; // px per hour
const START_HOUR = 8;
const END_HOUR = 22; // show through 9 PM (8pm and 9pm lines visible)
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

// Color palette for events
const EVENT_COLORS = [
  "bg-indigo-500/80 border-indigo-400",
  "bg-violet-500/80 border-violet-400",
  "bg-sky-500/80 border-sky-400",
  "bg-emerald-500/80 border-emerald-400",
  "bg-amber-500/80 border-amber-400",
  "bg-rose-500/80 border-rose-400",
];

function getEventColor(index: number): string {
  return EVENT_COLORS[index % EVENT_COLORS.length];
}

/** Extract hours and minutes from ISO string without timezone conversion.
 *  Works with "2026-03-16T09:00:00+05:30", "2026-03-16T09:00:00", etc. */
function parseLocalTime(isoStr: string): { hours: number; minutes: number } {
  // Time part starts after 'T': "09:00:00..."
  const timePart = isoStr.split("T")[1] || "00:00";
  const [h, m] = timePart.split(":");
  return { hours: parseInt(h, 10), minutes: parseInt(m, 10) };
}

/** Duration in minutes between two ISO strings (timezone-safe) */
function durationMinutes(startIso: string, endIso: string): number {
  // Use Date objects for correct duration calculation across timezone offsets
  return differenceInMinutes(parseISO(endIso), parseISO(startIso));
}

/** Format hour:minute from ISO string for display */
function formatTime(isoStr: string): string {
  const { hours, minutes } = parseLocalTime(isoStr);
  const suffix = hours >= 12 ? "PM" : "AM";
  const h = hours % 12 || 12;
  const m = minutes > 0 ? `:${String(minutes).padStart(2, "0")}` : "";
  return `${h}${m} ${suffix}`;
}

export function CalendarSidebar({
  events,
  highlightedSlots,
  loading,
  weekOffset,
  onWeekOffsetChange,
}: CalendarSidebarProps) {
  const [today, setToday] = useState<Date | null>(null);
  useEffect(() => { setToday(new Date()); }, []);

  const now = today ?? new Date();
  const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
  const weekStart = addDays(currentWeekStart, weekOffset * 7);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const goToPrevWeek = useCallback(() => onWeekOffsetChange(weekOffset - 1), [onWeekOffsetChange, weekOffset]);
  const goToNextWeek = useCallback(() => onWeekOffsetChange(weekOffset + 1), [onWeekOffsetChange, weekOffset]);
  const goToToday = useCallback(() => onWeekOffsetChange(0), [onWeekOffsetChange]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const day of weekDays) {
      const key = format(day, "yyyy-MM-dd");
      map.set(
        key,
        events.filter((e) => {
          // Extract date portion directly from ISO string (e.g. "2026-03-16" from "2026-03-16T09:00:00+05:30")
          const eventDateStr = e.start.substring(0, 10);
          return eventDateStr === key;
        })
      );
    }
    return map;
  }, [events, weekDays]);

  const slotsByDay = useMemo(() => {
    const map = new Map<string, AvailableSlot[]>();
    for (const day of weekDays) {
      const key = format(day, "yyyy-MM-dd");
      map.set(
        key,
        highlightedSlots.filter((s) => {
          const slotDateStr = s.start.substring(0, 10);
          return slotDateStr === key;
        })
      );
    }
    return map;
  }, [highlightedSlots, weekDays]);

  return (
    <div className="h-full flex flex-col bg-zinc-900 rounded-xl border border-zinc-800">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={goToPrevWeek}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
              title="Previous week"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h2 className="text-sm font-semibold text-zinc-200">
              {format(weekStart, "MMM d")} - {format(addDays(weekStart, 6), "MMM d, yyyy")}
            </h2>
            <button
              onClick={goToNextWeek}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
              title="Next week"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-2">
            {weekOffset !== 0 && (
              <button
                onClick={goToToday}
                className="text-[10px] px-2 py-0.5 rounded bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 transition-colors font-medium"
              >
                Today
              </button>
            )}
            {loading && (
              <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            )}
          </div>
        </div>
        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1 mt-3">
          {weekDays.map((day) => {
            const isWeekend = day.getDay() === 0 || day.getDay() === 6;
            return (
              <div
                key={day.toISOString()}
                className={`text-center text-xs py-1.5 rounded-md ${
                  today && isSameDay(day, today)
                    ? "bg-indigo-600 text-white font-medium"
                    : isWeekend
                    ? "text-zinc-600"
                    : "text-zinc-400"
                }`}
              >
                <div>{format(day, "EEE")}</div>
                <div className="font-medium">{format(day, "d")}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="relative">
          {/* Time labels */}
          <div className="flex">
            <div className="w-10 flex-shrink-0">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  style={{ height: HOUR_HEIGHT }}
                  className="flex items-start justify-end pr-1.5 pt-0"
                >
                  <span className="text-[10px] text-zinc-600 -mt-1.5">
                    {hour === 12 ? "12p" : hour > 12 ? `${hour - 12}p` : `${hour}a`}
                  </span>
                </div>
              ))}
            </div>

            {/* Day columns */}
            <div className="flex-1 grid grid-cols-7 gap-px">
              {weekDays.map((day) => {
                const dayKey = format(day, "yyyy-MM-dd");
                const dayEvents = eventsByDay.get(dayKey) || [];
                const daySlots = slotsByDay.get(dayKey) || [];
                const isWeekend = day.getDay() === 0 || day.getDay() === 6;

                return (
                  <div key={dayKey} className={`relative ${isWeekend ? "bg-zinc-900/50" : ""}`}>
                    {/* Hour grid lines */}
                    {HOURS.map((hour) => (
                      <div
                        key={hour}
                        style={{ height: HOUR_HEIGHT }}
                        className="border-t border-zinc-800/50"
                      />
                    ))}

                    {/* Events */}
                    {dayEvents.map((event, idx) => {
                      const { hours: sh, minutes: sm } = parseLocalTime(event.start);
                      const startMinutes = sh * 60 + sm;
                      const duration = durationMinutes(event.start, event.end);
                      const top =
                        ((startMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;
                      const height = (duration / 60) * HOUR_HEIGHT;

                      if (top < 0 || top > (END_HOUR - START_HOUR) * HOUR_HEIGHT) return null;

                      return (
                        <div
                          key={event.id}
                          className={`absolute left-0.5 right-0.5 rounded-md border-l-2 px-1 py-0.5 overflow-hidden cursor-default ${getEventColor(idx)}`}
                          style={{
                            top: Math.max(0, top),
                            height: Math.max(16, height),
                          }}
                          title={`${event.summary}\n${formatTime(event.start)} - ${formatTime(event.end)}`}
                        >
                          <p className="text-[9px] font-medium text-white truncate leading-tight">
                            {event.summary}
                          </p>
                          {height > 24 && (
                            <p className="text-[8px] text-white/70 truncate">
                              {formatTime(event.start)}
                            </p>
                          )}
                        </div>
                      );
                    })}

                    {/* Highlighted available slots */}
                    {daySlots.map((slot, idx) => {
                      const { hours: sh, minutes: sm } = parseLocalTime(slot.start);
                      const startMinutes = sh * 60 + sm;
                      const duration = durationMinutes(slot.start, slot.end);
                      const top =
                        ((startMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;
                      const height = (duration / 60) * HOUR_HEIGHT;

                      return (
                        <div
                          key={`slot-${idx}`}
                          className="absolute left-0.5 right-0.5 rounded-md border-2 border-dashed border-green-400 bg-green-400/10 px-1 py-0.5 animate-pulse"
                          style={{
                            top: Math.max(0, top),
                            height: Math.max(16, height),
                          }}
                          title={`Available: ${formatTime(slot.start)} - ${formatTime(slot.end)}`}
                        >
                          <p className="text-[9px] font-medium text-green-400 truncate">
                            Available
                          </p>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
