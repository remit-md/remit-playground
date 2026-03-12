import { apiPost, apiGet } from "../api.js";
import type { Flow, StepResult, FlowContext } from "./types.js";

export const depositFlow: Flow = {
  id: "deposit",
  label: "Deposit",
  description: "Lock a deposit — returned or forfeited by provider.",

  async *run(ctx: FlowContext): AsyncGenerator<StepResult> {
    // Step 1: Place deposit
    const depositReq = { to: ctx.provider.address, amount: 1.5, expires: 3600 };
    yield { label: "Agent → POST /deposits (lock)", side: "agent", request: depositReq };

    const deposit = await apiPost<{ depositId: string; status: string }>(
      "/deposits",
      { to: ctx.provider.address, amount: 1.5, expires: 3600 },
      ctx.agent,
    );
    yield { label: "Deposit locked on-chain", side: "both", response: deposit };

    // Step 2: Provider reviews
    yield { label: "Provider reviews deposit", side: "provider" };
    const fetched = await apiGet<unknown>(`/deposits/${deposit.depositId}`, ctx.provider);
    yield { label: "Provider sees locked deposit", side: "provider", response: fetched };

    // Step 3: Provider returns deposit
    yield { label: "Provider → POST /deposits/:id/return", side: "provider" };
    const returnTx = await apiPost<{ txHash: string }>(`/deposits/${deposit.depositId}/return`, {}, ctx.provider);
    yield { label: "Deposit returned to agent", side: "both", response: returnTx };

    const finalDeposit = await apiGet<unknown>(`/deposits/${deposit.depositId}`, ctx.agent);
    yield { label: "Deposit final state", side: "both", response: finalDeposit };
  },
};
