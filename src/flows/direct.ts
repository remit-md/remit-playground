import { apiPost, apiGet, pollEvents } from "../api.js";
import type { Flow, StepResult, FlowContext } from "./types.js";
import { ethers } from "ethers";

export const directFlow: Flow = {
  id: "direct",
  label: "Direct Payment",
  description: "Instant USDC transfer with no escrow.",

  async *run(ctx: FlowContext): AsyncGenerator<StepResult> {
    const startTs = Math.floor(Date.now() / 1000);
    const nonce = ethers.hexlify(ethers.randomBytes(16));

    const req = { to: ctx.provider.address, amount: 1.0, task: "playground demo" };
    yield { label: "Agent → POST /payments/direct", side: "agent", request: req };

    const tx = await apiPost<{ tx_hash: string; invoice_id: string }>(
      "/payments/direct",
      {
        to: ctx.provider.address,
        amount: 1.0,
        task: "playground demo",
        chain: "base-sepolia",
        nonce,
        signature: "0x",
      },
      ctx.agent,
    );

    yield { label: "Server → 201 Transaction confirmed", side: "agent", response: tx, balanceDelta: { agent: -1.0, provider: 0.99 } };

    yield { label: "Provider → GET /events (poll with retry)", side: "provider" };
    const events = await pollEvents(ctx.provider, startTs, 5);
    yield { label: `Provider ← ${events.length} event(s)`, side: "provider", response: events[0] ?? { note: "no events after retries" } };
  },
};
