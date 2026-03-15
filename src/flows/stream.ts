import { apiPost, apiGet } from "../api.js";
import type { Flow, StepResult, FlowContext } from "./types.js";

const RATE = 0.001;
const DURATION = 60;
const MAX_TOTAL = RATE * DURATION; // 0.06

export const streamFlow: Flow = {
  id: "stream",
  label: "Stream",
  description: "Pay by the second — open, accrue, withdraw, close.",

  async *run(ctx: FlowContext): AsyncGenerator<StepResult> {
    const streamReq = { payee: ctx.provider.address, rate_per_second: RATE, max_total: MAX_TOTAL };
    yield { label: "Agent → POST /streams (open)", side: "agent", request: streamReq };

    const stream = await apiPost<{ id: string; status: string }>(
      "/streams",
      { chain: "base-sepolia", payee: ctx.provider.address, rate_per_second: RATE, max_total: MAX_TOTAL },
      ctx.agent,
    );
    yield { label: `Stream opened @ $${RATE}/sec`, side: "both", response: stream, balanceDelta: { agent: -MAX_TOTAL } };

    yield {
      label: "Webhook delivered → POST https://your-webhook.example.com",
      side: "both",
      variant: "webhook",
      response: {
        id: "evt_" + Math.random().toString(36).slice(2, 10),
        event: "stream.opened",
        occurred_at: new Date().toISOString(),
        resource_type: "stream",
        resource_id: stream.id,
        currency: "USDC",
        testnet: true,
        data: {
          stream_id: stream.id,
          rate_per_second: RATE,
          max_total: MAX_TOTAL,
          max_total_units: Math.round(MAX_TOTAL * 1_000_000),
        },
      },
    };

    yield { label: "⏱ Funds accruing… (3s simulated)", side: "both" };
    await new Promise((r) => setTimeout(r, 3000));

    const withdrawAmount = +(RATE * 3).toFixed(6);
    yield { label: "Provider → POST /streams/:id/withdraw", side: "provider" };
    const withdrawTx = await apiPost<{ id: string }>(
      `/streams/${stream.id}/withdraw`,
      { amount: withdrawAmount },
      ctx.provider,
    );
    yield { label: "Provider ← Accrued USDC withdrawn", side: "provider", response: withdrawTx, balanceDelta: { provider: withdrawAmount } };

    yield { label: "Agent → POST /streams/:id/close", side: "agent" };
    const closeTx = await apiPost<{ id: string }>(`/streams/${stream.id}/close`, {}, ctx.agent);
    const accrued = withdrawAmount;
    const remainder = +(MAX_TOTAL - accrued).toFixed(6);
    yield { label: "Stream closed — remainder returned", side: "both", response: closeTx, balanceDelta: { agent: remainder } };

    yield {
      label: "Webhook delivered → POST https://your-webhook.example.com",
      side: "both",
      variant: "webhook",
      response: {
        id: "evt_" + Math.random().toString(36).slice(2, 10),
        event: "stream.closed",
        occurred_at: new Date().toISOString(),
        resource_type: "stream",
        resource_id: stream.id,
        currency: "USDC",
        testnet: true,
        data: {
          stream_id: stream.id,
          total_streamed: accrued,
          total_streamed_units: Math.round(accrued * 1_000_000),
          remainder: remainder,
          remainder_units: Math.round(remainder * 1_000_000),
          tx_hash: (closeTx as unknown as Record<string, unknown>)["tx_hash"] ?? "0x",
        },
      },
    };

    const finalStream = await apiGet<unknown>(`/streams/${stream.id}`, ctx.agent);
    yield { label: "Stream final state", side: "both", response: finalStream };
  },
};
