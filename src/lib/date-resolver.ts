import {
  addDays,
  addWeeks,
  startOfWeek,
  endOfWeek,
  nextMonday,
  nextTuesday,
  nextWednesday,
  nextThursday,
  nextFriday,
  nextSaturday,
  nextSunday,
  lastDayOfMonth,
  getDay,
  subDays,
  format,
  parse,
  isValid,
} from "date-fns";

/**
 * Resolves natural language date expressions into concrete date ranges.
 * This handles expressions like:
 *   - "next Tuesday"
 *   - "this Friday"
 *   - "late next week"
 *   - "last weekday of this month"
 *   - "tomorrow"
 *   - "June 20th"
 *   - "the day after tomorrow"
 */
export function resolveDate(expression: string): {
  dateStart: string;
  dateEnd: string;
  description: string;
} {
  const now = new Date();
  const expr = expression.toLowerCase().trim();

  // "tomorrow"
  if (expr === "tomorrow") {
    const d = addDays(now, 1);
    return singleDay(d, "Tomorrow");
  }

  // "today"
  if (expr === "today") {
    return singleDay(now, "Today");
  }

  // "the day after tomorrow"
  if (expr.includes("day after tomorrow")) {
    const d = addDays(now, 2);
    return singleDay(d, "Day after tomorrow");
  }

  // "next <day>"
  const nextDayMatch = expr.match(
    /next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/
  );
  if (nextDayMatch) {
    const d = getNextDay(nextDayMatch[1], now);
    return singleDay(d, `Next ${capitalize(nextDayMatch[1])}`);
  }

  // "this <day>"
  const thisDayMatch = expr.match(
    /this\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/
  );
  if (thisDayMatch) {
    const d = getNextDay(thisDayMatch[1], now);
    return singleDay(d, `This ${capitalize(thisDayMatch[1])}`);
  }

  // Just a day name: "tuesday", "friday afternoon" etc.
  const dayNameMatch = expr.match(
    /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/
  );
  if (dayNameMatch) {
    const d = getNextDay(dayNameMatch[1], now);
    return singleDay(d, capitalize(dayNameMatch[1]));
  }

  // "next week" / "late next week" / "early next week"
  if (expr.includes("next week")) {
    const nextWeekStart = startOfWeek(addWeeks(now, 1), { weekStartsOn: 1 });
    const nextWeekEnd = endOfWeek(addWeeks(now, 1), { weekStartsOn: 1 });

    if (expr.includes("late") || expr.includes("end of")) {
      // Late next week = Thursday-Friday
      const thursday = addDays(nextWeekStart, 3);
      const friday = addDays(nextWeekStart, 4);
      return {
        dateStart: format(thursday, "yyyy-MM-dd"),
        dateEnd: format(friday, "yyyy-MM-dd"),
        description: "Late next week (Thursday-Friday)",
      };
    }

    if (expr.includes("early") || expr.includes("beginning")) {
      // Early next week = Monday-Tuesday
      const tuesday = addDays(nextWeekStart, 1);
      return {
        dateStart: format(nextWeekStart, "yyyy-MM-dd"),
        dateEnd: format(tuesday, "yyyy-MM-dd"),
        description: "Early next week (Monday-Tuesday)",
      };
    }

    return {
      dateStart: format(nextWeekStart, "yyyy-MM-dd"),
      dateEnd: format(nextWeekEnd, "yyyy-MM-dd"),
      description: "Next week",
    };
  }

  // "this week"
  if (expr.includes("this week")) {
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

    if (expr.includes("late") || expr.includes("end of")) {
      const thursday = addDays(weekStart, 3);
      const friday = addDays(weekStart, 4);
      return {
        dateStart: format(thursday, "yyyy-MM-dd"),
        dateEnd: format(friday, "yyyy-MM-dd"),
        description: "Late this week (Thursday-Friday)",
      };
    }

    return {
      dateStart: format(now, "yyyy-MM-dd"),
      dateEnd: format(weekEnd, "yyyy-MM-dd"),
      description: "This week",
    };
  }

  // "last weekday of this month" / "last weekday of <month>"
  if (expr.includes("last weekday")) {
    const monthMatch = expr.match(
      /of\s+(january|february|march|april|may|june|july|august|september|october|november|december)/
    );

    let targetDate: Date;
    if (monthMatch) {
      const monthIndex = getMonthIndex(monthMatch[1]);
      const year =
        monthIndex < now.getMonth() ? now.getFullYear() + 1 : now.getFullYear();
      targetDate = lastDayOfMonth(new Date(year, monthIndex, 1));
    } else {
      targetDate = lastDayOfMonth(now);
    }

    // Walk backward to find a weekday
    while (getDay(targetDate) === 0 || getDay(targetDate) === 6) {
      targetDate = subDays(targetDate, 1);
    }

    return singleDay(
      targetDate,
      `Last weekday of the month (${format(targetDate, "EEEE, MMM d")})`
    );
  }

  // "morning of June 20th" / "June 20th" / "March 15"
  const dateMatch = expr.match(
    /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?/
  );
  if (dateMatch) {
    const monthIndex = getMonthIndex(dateMatch[1]);
    const day = parseInt(dateMatch[2]);
    const year =
      monthIndex < now.getMonth() ||
      (monthIndex === now.getMonth() && day < now.getDate())
        ? now.getFullYear() + 1
        : now.getFullYear();
    const d = new Date(year, monthIndex, day);
    return singleDay(d, format(d, "EEEE, MMMM d, yyyy"));
  }

  // Fallback: return next 5 business days
  const fallbackEnd = addDays(now, 7);
  return {
    dateStart: format(now, "yyyy-MM-dd"),
    dateEnd: format(fallbackEnd, "yyyy-MM-dd"),
    description: `Next 7 days (could not parse: "${expression}")`,
  };
}

function singleDay(
  d: Date,
  description: string
): { dateStart: string; dateEnd: string; description: string } {
  return {
    dateStart: format(d, "yyyy-MM-dd"),
    dateEnd: format(d, "yyyy-MM-dd"),
    description,
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function getNextDay(dayName: string, from: Date): Date {
  const fns: Record<string, (d: Date) => Date> = {
    monday: nextMonday,
    tuesday: nextTuesday,
    wednesday: nextWednesday,
    thursday: nextThursday,
    friday: nextFriday,
    saturday: nextSaturday,
    sunday: nextSunday,
  };
  return fns[dayName](from);
}

function getMonthIndex(monthName: string): number {
  const months = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  return months.indexOf(monthName);
}
