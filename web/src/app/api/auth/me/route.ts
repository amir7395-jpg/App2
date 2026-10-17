import { json, requireSession, route } from "@/lib/http";
import { publicUser } from "@/lib/auth";

export const GET = route(async (req) => json({ user: publicUser(await requireSession(req)) }));
