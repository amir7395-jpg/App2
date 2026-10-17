import { z } from "zod";
import { normalizePhone } from "./compliance";

export const phone = z
  .string()
  .transform((v, ctx) => {
    const p = normalizePhone(v);
    if (!p) ctx.addIssue({ code: "custom", message: "Enter a valid phone number" });
    return p ?? "";
  });

export const optionalText = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => v || null);

export const isoDateTime = z.coerce.date();
