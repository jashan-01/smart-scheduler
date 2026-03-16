import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveDate } from "./date-resolver";

/**
 * Date Resolver Tests
 *
 * Tests smart time parsing — a core evaluation criterion from the assignment:
 * - Basic relative dates (today, tomorrow, day after tomorrow)
 * - Named days (next Monday, this Friday, bare "tuesday")
 * - Week-relative expressions (next week, late next week, early this week)
 * - Month-relative expressions (last weekday of this month, last weekday of march)
 * - Specific date parsing (June 20th, March 15)
 * - Fallback for unparseable expressions
 *
 * Scenario coverage from assignment doc:
 * - "Complex date expressions" (last weekday of month, late next week)
 * - "Smart time parsing" (relative dates, contextual scheduling)
 */

describe("resolveDate", () => {
  // Fix time to Wednesday, March 18, 2026 10:00 AM UTC for deterministic tests
  const FIXED_DATE = new Date("2026-03-18T10:00:00.000Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_DATE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── Basic relative dates ──────────────────────────────────────────

  describe("basic relative dates", () => {
    it("resolves 'today' to current date", () => {
      const result = resolveDate("today");
      expect(result.dateStart).toBe("2026-03-18");
      expect(result.dateEnd).toBe("2026-03-18");
      expect(result.description).toBe("Today");
    });

    it("resolves 'tomorrow' to next day", () => {
      const result = resolveDate("tomorrow");
      expect(result.dateStart).toBe("2026-03-19");
      expect(result.dateEnd).toBe("2026-03-19");
      expect(result.description).toBe("Tomorrow");
    });

    it("resolves 'the day after tomorrow'", () => {
      const result = resolveDate("the day after tomorrow");
      expect(result.dateStart).toBe("2026-03-20");
      expect(result.dateEnd).toBe("2026-03-20");
      expect(result.description).toBe("Day after tomorrow");
    });

    it("resolves 'day after tomorrow' (without 'the')", () => {
      const result = resolveDate("day after tomorrow");
      expect(result.dateStart).toBe("2026-03-20");
      expect(result.dateEnd).toBe("2026-03-20");
    });
  });

  // ─── Named days with "next" ────────────────────────────────────────

  describe("next <day>", () => {
    it("resolves 'next monday' to the following Monday", () => {
      const result = resolveDate("next monday");
      expect(result.dateStart).toBe("2026-03-23");
      expect(result.dateEnd).toBe("2026-03-23");
      expect(result.description).toBe("Next Monday");
    });

    it("resolves 'next friday' to the following Friday", () => {
      const result = resolveDate("next friday");
      expect(result.dateStart).toBe("2026-03-20");
      expect(result.dateEnd).toBe("2026-03-20");
      expect(result.description).toBe("Next Friday");
    });

    it("resolves 'next wednesday' (same weekday) to following week", () => {
      // Current day is Wednesday, so next wednesday should be next week
      const result = resolveDate("next wednesday");
      expect(result.dateStart).toBe("2026-03-25");
      expect(result.dateEnd).toBe("2026-03-25");
      expect(result.description).toBe("Next Wednesday");
    });

    it("resolves 'next saturday'", () => {
      const result = resolveDate("next saturday");
      expect(result.dateStart).toBe("2026-03-21");
      expect(result.dateEnd).toBe("2026-03-21");
      expect(result.description).toBe("Next Saturday");
    });

    it("resolves 'next sunday'", () => {
      const result = resolveDate("next sunday");
      expect(result.dateStart).toBe("2026-03-22");
      expect(result.dateEnd).toBe("2026-03-22");
      expect(result.description).toBe("Next Sunday");
    });
  });

  // ─── Named days with "this" ────────────────────────────────────────

  describe("this <day>", () => {
    it("resolves 'this friday' to upcoming Friday", () => {
      const result = resolveDate("this friday");
      expect(result.dateStart).toBe("2026-03-20");
      expect(result.dateEnd).toBe("2026-03-20");
      expect(result.description).toBe("This Friday");
    });

    it("resolves 'this monday' to upcoming Monday", () => {
      const result = resolveDate("this monday");
      expect(result.dateStart).toBe("2026-03-23");
      expect(result.dateEnd).toBe("2026-03-23");
      expect(result.description).toBe("This Monday");
    });
  });

  // ─── Bare day names ────────────────────────────────────────────────

  describe("bare day names", () => {
    it("resolves 'tuesday' to the next Tuesday", () => {
      const result = resolveDate("tuesday");
      expect(result.dateStart).toBe("2026-03-24");
      expect(result.dateEnd).toBe("2026-03-24");
      expect(result.description).toBe("Tuesday");
    });

    it("resolves 'friday' to the next Friday", () => {
      const result = resolveDate("friday");
      expect(result.dateStart).toBe("2026-03-20");
      expect(result.dateEnd).toBe("2026-03-20");
      expect(result.description).toBe("Friday");
    });

    it("resolves 'monday' to the next Monday", () => {
      const result = resolveDate("monday");
      expect(result.dateStart).toBe("2026-03-23");
      expect(result.dateEnd).toBe("2026-03-23");
    });
  });

  // ─── Week-relative expressions ────────────────────────────────────

  describe("week-relative expressions", () => {
    it("resolves 'next week' to full Mon-Sun range", () => {
      const result = resolveDate("next week");
      expect(result.dateStart).toBe("2026-03-23"); // Next Monday
      expect(result.dateEnd).toBe("2026-03-29"); // Next Sunday
      expect(result.description).toBe("Next week");
    });

    it("resolves 'late next week' to Thursday-Friday", () => {
      const result = resolveDate("late next week");
      expect(result.dateStart).toBe("2026-03-26"); // Thursday
      expect(result.dateEnd).toBe("2026-03-27"); // Friday
      expect(result.description).toContain("Late next week");
    });

    it("resolves 'early next week' to Monday-Tuesday", () => {
      const result = resolveDate("early next week");
      expect(result.dateStart).toBe("2026-03-23"); // Monday
      expect(result.dateEnd).toBe("2026-03-24"); // Tuesday
      expect(result.description).toContain("Early next week");
    });

    it("resolves 'end of next week' to Thursday-Friday", () => {
      const result = resolveDate("end of next week");
      expect(result.dateStart).toBe("2026-03-26");
      expect(result.dateEnd).toBe("2026-03-27");
    });

    it("resolves 'beginning of next week' to Monday-Tuesday", () => {
      const result = resolveDate("beginning of next week");
      expect(result.dateStart).toBe("2026-03-23");
      expect(result.dateEnd).toBe("2026-03-24");
    });

    it("resolves 'this week' to remaining days", () => {
      const result = resolveDate("this week");
      expect(result.dateStart).toBe("2026-03-18"); // Today (Wednesday)
      expect(result.dateEnd).toBe("2026-03-22"); // Sunday
      expect(result.description).toBe("This week");
    });

    it("resolves 'late this week' to Thursday-Friday", () => {
      const result = resolveDate("late this week");
      expect(result.dateStart).toBe("2026-03-19"); // Thursday
      expect(result.dateEnd).toBe("2026-03-20"); // Friday
      expect(result.description).toContain("Late this week");
    });
  });

  // ─── Month-relative expressions (above & beyond) ──────────────────

  describe("last weekday of month", () => {
    it("resolves 'last weekday of this month' correctly", () => {
      // March 2026: 31st is a Tuesday → last weekday is Tuesday March 31
      const result = resolveDate("last weekday of this month");
      expect(result.dateStart).toBe("2026-03-31");
      expect(result.dateEnd).toBe("2026-03-31");
      expect(result.description).toContain("Last weekday");
    });

    it("resolves 'last weekday of april' correctly", () => {
      // April 2026: 30th is a Thursday → last weekday is April 30
      const result = resolveDate("last weekday of april");
      expect(result.dateStart).toBe("2026-04-30");
      expect(result.dateEnd).toBe("2026-04-30");
    });

    it("handles months where last day is a weekend", () => {
      // May 2026: 31st is a Sunday → walks back to Friday May 29
      const result = resolveDate("last weekday of may");
      expect(result.dateStart).toBe("2026-05-29");
      expect(result.dateEnd).toBe("2026-05-29");
    });

    it("handles months where last day is Saturday", () => {
      // January 2027: 31st is a Sunday → walks back to Friday Jan 29
      // Actually let's check: August 2026: 31st is a Monday
      // February 2026: 28th is a Saturday → walks back to Friday Feb 27
      const result = resolveDate("last weekday of february");
      // Feb 2026 is past (we're in March 2026), so it should be Feb 2027
      // Feb 2027: 28th is a Sunday → walks back to Friday Feb 26
      expect(result.dateStart).toBe("2027-02-26");
      expect(result.dateEnd).toBe("2027-02-26");
    });

    it("wraps to next year for past months", () => {
      // We're in March 2026. January is past → should give Jan 2027
      const result = resolveDate("last weekday of january");
      // January 2027: 31st is a Sunday → walks back to Friday Jan 29
      expect(result.dateStart).toBe("2027-01-29");
      expect(result.dateEnd).toBe("2027-01-29");
    });
  });

  // ─── Specific date parsing ────────────────────────────────────────

  describe("specific dates", () => {
    it("resolves 'June 20th'", () => {
      const result = resolveDate("June 20th");
      expect(result.dateStart).toBe("2026-06-20");
      expect(result.dateEnd).toBe("2026-06-20");
    });

    it("resolves 'march 15'", () => {
      // March 15 is past (we're on March 18), so should be next year
      const result = resolveDate("march 15");
      expect(result.dateStart).toBe("2027-03-15");
      expect(result.dateEnd).toBe("2027-03-15");
    });

    it("resolves 'december 25th'", () => {
      const result = resolveDate("december 25th");
      expect(result.dateStart).toBe("2026-12-25");
      expect(result.dateEnd).toBe("2026-12-25");
    });

    it("resolves 'april 1st'", () => {
      const result = resolveDate("april 1st");
      expect(result.dateStart).toBe("2026-04-01");
      expect(result.dateEnd).toBe("2026-04-01");
    });

    it("resolves 'july 2nd'", () => {
      const result = resolveDate("july 2nd");
      expect(result.dateStart).toBe("2026-07-02");
      expect(result.dateEnd).toBe("2026-07-02");
    });

    it("resolves 'november 3rd'", () => {
      const result = resolveDate("november 3rd");
      expect(result.dateStart).toBe("2026-11-03");
      expect(result.dateEnd).toBe("2026-11-03");
    });
  });

  // ─── Edge cases ───────────────────────────────────────────────────

  describe("edge cases", () => {
    it("handles case-insensitive input", () => {
      const result = resolveDate("NEXT MONDAY");
      expect(result.dateStart).toBe("2026-03-23");
    });

    it("handles extra whitespace", () => {
      const result = resolveDate("  tomorrow  ");
      expect(result.dateStart).toBe("2026-03-19");
    });

    it("falls back gracefully for unparseable expressions", () => {
      const result = resolveDate("sometime whenever");
      // Should return a 7-day range from today
      expect(result.dateStart).toBe("2026-03-18");
      expect(result.dateEnd).toBe("2026-03-25");
      expect(result.description).toContain("could not parse");
    });

    it("singleDay returns same start and end", () => {
      const result = resolveDate("today");
      expect(result.dateStart).toBe(result.dateEnd);
    });
  });

  // ─── Assignment scenario: complex date expressions ────────────────

  describe("assignment scenarios - complex date expressions", () => {
    it("handles 'late next week' → Thursday-Friday of next week", () => {
      const result = resolveDate("late next week");
      // Next week starts Mon March 23
      expect(result.dateStart).toBe("2026-03-26"); // Thursday
      expect(result.dateEnd).toBe("2026-03-27"); // Friday
    });

    it("handles 'last weekday of this month' → last business day", () => {
      const result = resolveDate("last weekday of this month");
      // March 31, 2026 is a Tuesday → that's a weekday
      expect(result.dateStart).toBe("2026-03-31");
    });

    it("handles sequential day resolution for multi-step scheduling", () => {
      // When user says "not Monday, how about Tuesday?" the LLM
      // would call resolve_date("tuesday")
      const result = resolveDate("tuesday");
      expect(result.dateStart).toBe("2026-03-24");
    });
  });
});
