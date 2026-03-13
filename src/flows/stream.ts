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
    const startTs = Math.floor(Date.now() / 1000);
    const streamReq = { payee: ctx.provider.address, rate_per_second: RATE, max_total: MAX_TOTAL };
    yield { label: "Agent → POST /streams (open)", side: "agent", request: streamReq };

    const stream = await apiPost<{ id: string; status: string }>(
      "/streams",
      { chain: "base-sepolia", payee: ctx.provider.address, rate_per_second: RATE, max_total: MAX_TOTAL },
      ctx.agent,
    );
    yield { label: `Stream opened @ $${RATE}/sec`, side: "both", response: stream, balanceDelta: { agent: -MAX_TOTAL } };

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

    yield { label: "Provider → GET /events (poll)", side: "provider" };
    const events = await apiGet<Record<string, unknown>[]>(`/events?since=${startTs}&limit=10`, ctx.provider).catch(() => []);
    yield { label: `Provider ← ${events.length} event(s)`, side: "provider", response: events[0] ?? { note: "events pending" } };

    const finalStream = await apiGet<unknown>(`/streams/${stream.id}`, ctx.agent);
    yield { label: "Stream final state", side: "both", response: finalStream };
  },
};
