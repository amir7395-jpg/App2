import { describe, expect, it } from "vitest";
import { wallClock, zonedTimeToUtc } from "../time";
import { findOpenSlots } from "../availability";
import { isWithinCallingWindow, normalizePhone } from "../compliance";
import { MONDAY_2PM, setup } from "./helpers";
import { appointments } from "../db/schema";

describe("timezones", () => {
  it("converts New York wall time to UTC on both sides of DST", () => {
    expect(zonedTimeToUtc(2026, 7, 1, 9, 0, "America/New_York").toISOString()).toBe("2026-07-01T13:00:00.000Z");
    expect(zonedTimeToUtc(2026, 12, 1, 9, 0, "America/New_York").toISOString()).toBe("2026-12-01T14:00:00.000Z");
  });
  it("reads wall clock parts", () => {
    expect(wallClock(MONDAY_2PM, "America/New_York")).toMatchObject({ hour: 14, weekday: 1, day: 19 });
  });
});

describe("availability", () => {
  it("offers slots inside business hours, skipping booked ones and the lead time", () => {
    const { db, business } = setup();
    db.insert(appointments)
      .values({
        businessId: business.id,
        title: "Existing",
        startsAt: new Date("2026-10-19T20:30:00Z"), // 4:30pm
        endsAt: new Date("2026-10-19T21:00:00Z"),
      })
      .run();
    const slots = findOpenSlots(db, business, { from: MONDAY_2PM, now: MONDAY_2PM, limit: 3 });
    // 2pm + 2h lead time = 4pm; 4:30 is booked; next day starts 9am.
    expect(slots.map((s) => s.start.toISOString())).toEqual([
      "2026-10-19T20:00:00.000Z",
      "2026-10-20T13:00:00.000Z",
      "2026-10-20T13:30:00.000Z",
    ]);
  });
  it("skips weekends", () => {
    const { db, business } = setup();
    const friday5pm = new Date("2026-10-23T21:00:00Z");
    const [first] = findOpenSlots(db, business, { from: friday5pm, now: friday5pm, limit: 1 });
    expect(first.start.toISOString()).toBe("2026-10-26T13:00:00.000Z"); // Monday 9am
  });
});

describe("compliance", () => {
  it("only calls between 9am and 8pm business time", () => {
    const { business } = setup();
    expect(isWithinCallingWindow(business, MONDAY_2PM)).toBe(true);
    expect(isWithinCallingWindow(business, new Date("2026-10-20T00:30:00Z"))).toBe(false); // 8:30pm
    expect(isWithinCallingWindow(business, new Date("2026-10-19T12:59:00Z"))).toBe(false); // 8:59am
  });
  it("normalizes phone numbers to E.164", () => {
    expect(normalizePhone("(555) 123-4567")).toBe("+15551234567");
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
    expect(normalizePhone("123")).toBeNull();
  });
});
