import { z } from "zod";
import { getDb } from "@/lib/db";
import { body, json, requireSubscriber, route } from "@/lib/http";
import { connectionStatus, disconnect, setCustomersConsented } from "@/lib/quickbooks";
import { config, quickbooksEnabled } from "@/lib/config";

const status = (businessId: string) => ({
  ...connectionStatus(getDb(), businessId),
  available: quickbooksEnabled(),
  environment: config.quickbooksEnvironment,
});

export const GET = route(async (req) => {
  const { business } = await requireSubscriber(req);
  return json({ quickbooks: status(business.id), graceDays: business.invoiceGraceDays });
});

export const PATCH = route(async (req) => {
  const { business } = await requireSubscriber(req);
  const input = await body(req, z.object({ customersConsented: z.boolean() }));
  setCustomersConsented(getDb(), business.id, input.customersConsented);
  return json({ quickbooks: status(business.id) });
});

export const DELETE = route(async (req) => {
  const { business } = await requireSubscriber(req);
  await disconnect(getDb(), business.id);
  return json({ quickbooks: status(business.id) });
});
