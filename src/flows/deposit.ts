import { apiPost, apiGet } from "../api.js";
import type { Flow, StepResult, FlowContext } from "./types.js";

export const depositFlow: Flow = {
  id: "deposit",
  label: "Deposit",
  description: "Lock a deposit — returned or forfeited by provider.",

  async *run(ctx: FlowContext): AsyncGenerator<StepResult> {
    const expiry = Math.floor(Date.now() / 1000) + 3600;

    const depositReq = { provider: ctx.provider.address, amount: 1.5, expiry };
    yield { label: "Agent → POST /deposits (lock)", side: "agent", request: depositReq };

    const deposit = await apiPost<{ id: string; status: string }>(
      "/deposits",
      { chain: "base-sepolia", provider: ctx.provider.address, amount: 1.5, expiry },
      ctx.agent,
    );
    yield { label: "Deposit locked on-chain", side: "both", response: deposit, balanceDelta: { agent: -1.5 } };

    yield { label: "Provider reviews deposit", side: "provider" };
    const fetched = await apiGet<unknown>(`/deposits/${deposit.id}`, ctx.provider);
    yield { label: "Provider sees locked deposit", side: "provider", response: fetched };

    yield { label: "Provider → POST /deposits/:id/return", side: "provider" };
    const returnTx = await apiPost<{ id: string }>(
      `/deposits/${deposit.id}/return`,
      {},
      ctx.provider,
    );
    yield { label: "Deposit returned to agent", side: "both", response: returnTx, balanceDelta: { agent: 1.5 } };

    const finalDeposit = await apiGet<unknown>(`/deposits/${deposit.id}`, ctx.agent);
    yield { label: "Deposit final state", side: "both", response: finalDeposit };
  },
};
