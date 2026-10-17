import type { Call } from "./db/schema";

/** Strip internal fields (raw model history) before sending a call to clients. */
export function publicCall(call: Call) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { history, ...rest } = call;
  return rest;
}
