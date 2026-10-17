import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { businesses, users, type Business, type User } from "./db/schema";
import { sessionSecretBytes } from "./config";

export const SESSION_COOKIE = "session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export const hashPassword = (password: string) => bcrypt.hash(password, 10);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(sessionSecretBytes());
}

export async function readSessionToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecretBytes());
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};

export interface Session {
  user: User;
  business: Business;
}

export function loadSession(userId: string | null): Session | null {
  if (!userId) return null;
  const db = getDb();
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return null;
  const business = db.select().from(businesses).where(eq(businesses.id, user.businessId)).get();
  return business ? { user, business } : null;
}

/** Web sends the session cookie; the mobile app sends `Authorization: Bearer <token>`. */
export async function sessionFromRequest(req: Request): Promise<Session | null> {
  const header = req.headers.get("authorization");
  let token: string | undefined;
  if (header?.startsWith("Bearer ")) token = header.slice(7);
  else {
    const cookie = req.headers.get("cookie") ?? "";
    token = cookie
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
      ?.slice(SESSION_COOKIE.length + 1);
  }
  return loadSession(await readSessionToken(token));
}

export const hasActiveSubscription = (b: Business) =>
  b.subscriptionStatus === "active" || b.subscriptionStatus === "trialing";

export function publicUser(s: Session) {
  return {
    id: s.user.id,
    email: s.user.email,
    name: s.user.name,
    business: { id: s.business.id, name: s.business.name },
    subscriptionStatus: s.business.subscriptionStatus,
    subscriptionActive: hasActiveSubscription(s.business),
  };
}
