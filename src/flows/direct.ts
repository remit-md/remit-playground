import { apiPost, apiGet } from "../api.js";
import type { Flow, StepResult, FlowContext } from "./types.js";

export const directFlow: Flow = {
  id: "direct",
  label: "Direct Payment",
  description: "Instant USDC transfer with no escrow.",

  async *run(ctx: FlowContext): AsyncGenerator<StepResult> {
    // Step 1: Agent sends direct payment
    const req = { to: ctx.provider.address, amount: 1.0, memo: "playground demo" };
    yield { label: "Agent → POST /payments/direct", side: "agent", request: req };

    const tx = await apiPost<{ txHash: string; invoiceId: string }>(
      "/payments/direct",
      { to: ctx.provider.address, amount: 1.0, task: "playground demo", chain: "base-sepolia" },
      ctx.agent,
    );

    yield { label: "Server → 201 Transaction confirmed", side: "agent", response: tx };

    // Step 2: Provider confirms receipt via events
    yield { label: "Provider checks events", side: "provider" };
    const events = await apiGet<unknown[]>(`/events?wallet=${ctx.provider.address}&limit=5`, ctx.provider);
    yield { label: "Provider ← payment event received", side: "provider", response: events[0] ?? { note: "event may arrive shortly" } };
  },
};
