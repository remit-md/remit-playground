import { apiPost, apiGet } from "../api.js";
import type { Flow, StepResult, FlowContext } from "./types.js";

export const tabFlow: Flow = {
  id: "tab",
  label: "Metered Tab",
  description: "Open a tab, charge per API call, close to settle.",

  async *run(ctx: FlowContext): AsyncGenerator<StepResult> {
    // Step 1: Open tab
    const tabReq = { provider: ctx.provider.address, limit: 10, per_unit: 0.5, expires: 3600 };
    yield { label: "Agent → POST /tabs (open)", side: "agent", request: tabReq };

    const expiry = Math.floor(Date.now() / 1000) + 3600;
    const tab = await apiPost<{ tabId: string; status: string }>(
      "/tabs",
      { chain: "base-sepolia", provider: ctx.provider.address, limit_amount: 10, per_unit: 0.5, expiry },
      ctx.agent,
    );
    yield { label: "Tab opened", side: "both", response: tab };

    // Step 2: Provider charges tab (×2)
    for (let i = 1; i <= 2; i++) {
      yield { label: `Provider → POST /tabs/:id/charge (call ${i})`, side: "provider", request: { units: 1 } };
      const chargeRes = await apiPost<unknown>(`/tabs/${tab.tabId}/charge`, { units: 1, task: `API call ${i}` }, ctx.provider);
      yield { label: `Charge ${i} accepted`, side: "provider", response: chargeRes };
    }

    // Step 3: Close tab
    yield { label: "Agent → POST /tabs/:id/close", side: "agent" };
    const closeTx = await apiPost<{ txHash: string }>(`/tabs/${tab.tabId}/close`, { final_amount: 0, provider_sig: "0x" }, ctx.agent);
    yield { label: "Tab closed — USDC settled on-chain", side: "both", response: closeTx };

    // Final state
    const finalTab = await apiGet<unknown>(`/tabs/${tab.tabId}`, ctx.agent);
    yield { label: "Tab final state", side: "both", response: finalTab };
  },
};
