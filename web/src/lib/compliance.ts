import type { Business } from "./db/schema";
import { wallClock } from "./time";

/**
 * Outbound automated calls are limited to 9:00–20:00 in the business timezone.
 * The US TCPA forbids telemarketing calls before 8am or after 9pm in the *recipient's*
 * local time; we keep an hour of margin each side because we only know the business
 * timezone, not where each contact is.
 */
export const CALL_WINDOW = { startHour: 9, endHour: 20 };

export function isWithinCallingWindow(business: Business, now = new Date()): boolean {
  const w = wallClock(now, business.timezone);
  return w.hour >= CALL_WINDOW.startHour && w.hour < CALL_WINDOW.endHour;
}

export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`; // assume North American number
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}
