import { z } from "zod";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { businesses, users } from "@/lib/db/schema";
import { body, HttpError, json, route } from "@/lib/http";
import { createSessionToken, hashPassword, loadSession, publicUser, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { isValidTimeZone } from "@/lib/time";

const DEFAULT_HOURS = Object.fromEntries(
  [0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), d === 0 || d === 6 ? null : { open: "09:00", close: "17:00" }]),
);

const Signup = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(8, "Password must be at least 8 characters"),
  businessName: z.string().trim().min(1),
  timezone: z.string().refine(isValidTimeZone, "Unknown timezone").default("America/New_York"),
});

export const POST = route(async (req) => {
  const input = await body(req, Signup);
  const db = getDb();
  if (db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).get()) {
    throw new HttpError(409, "An account with this email already exists");
  }
  const passwordHash = await hashPassword(input.password);
  const userId = db.transaction((tx) => {
    const business = tx
      .insert(businesses)
      .values({ name: input.businessName, timezone: input.timezone, businessHours: DEFAULT_HOURS })
      .returning()
      .get();
    return tx
      .insert(users)
      .values({ businessId: business.id, email: input.email, name: input.name, passwordHash })
      .returning()
      .get().id;
  });
  const token = await createSessionToken(userId);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);
  return json({ token, user: publicUser(loadSession(userId)!) }, 201);
});
