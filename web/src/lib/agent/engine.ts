import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam,
  BetaToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { eq } from "drizzle-orm";
import type { DB } from "../db";
import { businesses, callMessages, calls, invoices, leads } from "../db/schema";
import { config } from "../config";
import type { Telephony } from "../telephony";
import { invoiceSystemPrompt, leadSystemPrompt } from "./prompts";
import { executeTool, toApiTools, toolsFor, type ToolContext } from "./tools";

/** The one SDK call the engine makes; injectable so tests can script Claude's replies. */
export type CreateMessage = (params: MessageCreateParamsNonStreaming) => Promise<BetaMessage>;

let anthropic: Anthropic | null = null;
export const anthropicCreateMessage: CreateMessage = (params) => {
  anthropic ??= new Anthropic({ apiKey: config.anthropicApiKey, timeout: 12_000, maxRetries: 1 });
  return anthropic.beta.messages.create(params);
};

const MAX_TOOL_ROUNDS = 5;
const FALLBACK_LINE = "Sorry, I'm having trouble on my end. Someone from the business will call you back. Goodbye!";

export interface TurnResult {
  reply: string;
  ended: boolean;
}

/**
 * Run one conversational turn: feed what the contact said to Claude, execute any tools it calls,
 * and return the text to speak. The Claude history is stored on the call and only ever appended to.
 */
export async function runAgentTurn(opts: {
  db: DB;
  callId: string;
  contactSaid: string;
  telephony: Telephony;
  createMessage?: CreateMessage;
  now?: Date;
  /** When true, the contact's words are not shown in the transcript (e.g. the "call connected" cue). */
  hiddenInput?: boolean;
}): Promise<TurnResult> {
  const { db, callId } = opts;
  const createMessage = opts.createMessage ?? anthropicCreateMessage;
  const call = db.select().from(calls).where(eq(calls.id, callId)).get();
  if (!call) throw new Error(`Call ${callId} not found`);
  if (call.ended) return { reply: "", ended: true };
  const business = db.select().from(businesses).where(eq(businesses.id, call.businessId)).get()!;
  const lead = call.leadId ? db.select().from(leads).where(eq(leads.id, call.leadId)).get() : undefined;
  const invoice = call.invoiceId ? db.select().from(invoices).where(eq(invoices.id, call.invoiceId)).get() : undefined;

  const system =
    call.purpose === "lead" && lead
      ? leadSystemPrompt(business, lead, call)
      : invoice
        ? invoiceSystemPrompt(business, invoice, call)
        : null;
  if (!system) throw new Error("Call has no lead or invoice attached");

  const tools = toolsFor(call.purpose);
  const apiTools = toApiTools(tools);
  const ctx: ToolContext = { db, business, call, lead, invoice, now: opts.now ?? new Date(), telephony: opts.telephony, events: [] };
  const history: BetaMessageParam[] = [...call.history, { role: "user", content: opts.contactSaid }];
  if (!opts.hiddenInput) logMessage(db, callId, "contact", opts.contactSaid);

  const spoken: string[] = [];
  let failed = false;
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let response: BetaMessage;
    try {
      response = await createMessage({
        model: config.agentModel,
        max_tokens: 4096,
        system,
        tools: apiTools,
        messages: history,
        // Phone calls need fast replies; low effort keeps latency down.
        output_config: { effort: "low" },
        cache_control: { type: "ephemeral" },
        // If the model declines for policy reasons, let the API retry on its recommended fallback model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
    } catch (err) {
      console.error("Claude request failed", err);
      failed = true;
      break;
    }

    if (response.stop_reason === "refusal") {
      failed = true;
      break;
    }
    // Append the assistant turn exactly as returned (thinking blocks included).
    history.push({ role: "assistant", content: response.content as BetaContentBlockParam[] });
    for (const block of response.content) {
      if (block.type === "text" && block.text.trim()) spoken.push(block.text.trim());
    }

    const toolUses = response.content.filter((b) => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) break;

    const results: BetaToolResultBlockParam[] = [];
    for (const use of toolUses) {
      const result = await executeTool(tools, use.name, use.input, ctx);
      results.push({ type: "tool_result", tool_use_id: use.id, content: result.content, is_error: result.isError });
    }
    history.push({ role: "user", content: results });
    // end_call means this turn's text is the goodbye; skip another round trip.
    if (ctx.endRequested && spoken.length) break;
  }

  for (const event of ctx.events) logMessage(db, callId, "event", event);

  let reply = spoken.join(" ");
  let ended = Boolean(ctx.endRequested);
  if (failed || !reply) {
    if (failed || ended) {
      reply = failed ? FALLBACK_LINE : reply || "Thanks for your time. Goodbye!";
      ended = true;
    } else {
      reply = "Sorry, could you say that again?";
    }
  }
  logMessage(db, callId, "agent", reply);

  const closing = ended ? (ctx.endRequested?.summary ?? (failed ? "Agent error; call ended early" : null)) : null;
  const outcome = [call.outcome, ...ctx.events, closing].filter(Boolean).join("; ") || null;
  db.update(calls)
    .set({
      history,
      outcome,
      ...(ended ? { ended: true, status: "completed" as const, endedAt: new Date() } : {}),
    })
    .where(eq(calls.id, callId))
    .run();

  return { reply, ended };
}

function logMessage(db: DB, callId: string, role: "agent" | "contact" | "event", content: string) {
  db.insert(callMessages).values({ callId, role, content }).run();
}
