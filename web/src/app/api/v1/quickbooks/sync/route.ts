import { getDb } from "@/lib/db";
import { HttpError, json, requireSubscriber, route } from "@/lib/http";
import { QuickBooksError, syncBusiness } from "@/lib/quickbooks";

/** "Sync now" button; the scheduler also syncs every hour. */
export const POST = route(async (req) => {
  const { business } = await requireSubscriber(req);
  try {
    return json({ result: await syncBusiness(getDb(), business) });
  } catch (err) {
    if (err instanceof QuickBooksError) throw new HttpError(502, err.message);
    throw err;
  }
});
