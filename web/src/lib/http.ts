import { NextResponse } from "next/server";
import { z } from "zod";
import { hasActiveSubscription, sessionFromRequest, type Session } from "./auth";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Wraps a route handler so thrown HttpErrors and validation errors become JSON responses. */
export function route<C>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      if (err instanceof z.ZodError) {
        const issue = err.issues[0];
        return json({ error: `${issue.path.join(".") || "input"}: ${issue.message}` }, 400);
      }
      console.error(err);
      return json({ error: "Internal server error" }, 500);
    }
  };
}

export async function requireSession(req: Request): Promise<Session> {
  const session = await sessionFromRequest(req);
  if (!session) throw new HttpError(401, "Not signed in");
  return session;
}

/** The product features (leads, calls, invoices…) are only for paying accounts. */
export async function requireSubscriber(req: Request): Promise<Session> {
  const session = await requireSession(req);
  if (!hasActiveSubscription(session.business)) throw new HttpError(402, "An active subscription is required");
  return session;
}

export async function body<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let data: unknown;
  try {
    data = await req.json();
  } catch {
    throw new HttpError(400, "Body must be JSON");
  }
  return schema.parse(data);
}
