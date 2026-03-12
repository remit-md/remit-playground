import { apiPost, apiGet } from "../api.js";
import type { Flow, StepResult, FlowContext } from "./types.js";

const PER_UNIT = 0.5;
const LIMIT = 10;

export const tabFlow: Flow = {
  id: "tab",
  label: "Metered Tab",
  description: "Open a tab, charge per API call, close to settle.",

  async *run(ctx: FlowContext): AsyncGenerator<StepResult> {
    const expiry = Math.floor(Date.now() / 1000) + 3600;
    const tabReq = { provider: ctx.provider.address, limit_amount: LIMIT, per_unit: PER_UNIT, expiry };
    yield { label: "Agent → POST /tabs (open)", side: "agent", request: tabReq };

    const tab = await apiPost<{ id: string; status: string }>(
      "/tabs",
      { chain: "base-sepolia", provider: ctx.provider.address, limit_amount: LIMIT, per_unit: PER_UNIT, expiry },
      ctx.agent,
    );
    yield { label: "Tab opened", side: "both", response: tab };

    let cumulative = 0;
    for (let i = 1; i <= 2; i++) {
      cumulative = +(PER_UNIT * i).toFixed(6);
      const chargeReq = { amount: PER_UNIT, cumulative, call_count: i, provider_sig: "0x" };
      yield { label: `Provider → POST /tabs/:id/charge (call ${i})`, side: "provider", request: chargeReq };
      const chargeRes = await apiPost<unknown>(`/tabs/${tab.id}/charge`, chargeReq, ctx.provider);
      yield { label: `Charge ${i} accepted`, side: "provider", response: chargeRes };
    }

    yield { label: "Agent → POST /tabs/:id/close", side: "agent" };
    const closeTx = await apiPost<{ id: string }>(
      `/tabs/${tab.id}/close`,
      { final_amount: cumulative, provider_sig: "0x" },
      ctx.agent,
    );
    yield { label: "Tab closed — USDC settled on-chain", side: "both", response: closeTx };

    const finalTab = await apiGet<unknown>(`/tabs/${tab.id}`, ctx.agent);
    yield { label: "Tab final state", side: "both", response: finalTab };
  },
};
