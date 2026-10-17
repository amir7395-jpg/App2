import { z } from "zod";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { body, HttpError, json, route } from "@/lib/http";
import { createSessionToken, loadSession, publicUser, SESSION_COOKIE, sessionCookieOptions, verifyPassword } from "@/lib/auth";

const Login = z.object({ email: z.string().trim().toLowerCase(), password: z.string() });

export const POST = route(async (req) => {
  const input = await body(req, Login);
  const user = getDb().select().from(users).where(eq(users.email, input.email)).get();
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new HttpError(401, "Wrong email or password");
  }
  const token = await createSessionToken(user.id);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);
  // The token is returned for the mobile app, which stores it in the device keychain.
  return json({ token, user: publicUser(loadSession(user.id)!) });
});
