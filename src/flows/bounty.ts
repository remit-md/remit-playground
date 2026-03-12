import { apiPost, apiGet } from "../api.js";
import type { Flow, StepResult, FlowContext } from "./types.js";

export const bountyFlow: Flow = {
  id: "bounty",
  label: "Bounty",
  description: "Post a task, submit work, award payment.",

  async *run(ctx: FlowContext): AsyncGenerator<StepResult> {
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    // Step 1: Post bounty
    const bountyReq = { amount: 3.0, task: "Write a haiku about USDC", deadline };
    yield { label: "Agent → POST /bounties (post)", side: "agent", request: bountyReq };

    const bounty = await apiPost<{ bountyId: string; status: string }>(
      "/bounties",
      { amount: 3.0, task: "Write a haiku about USDC", deadline, validation: "poster", maxAttempts: 10 },
      ctx.agent,
    );
    yield { label: "Bounty posted — USDC locked", side: "both", response: bounty };

    // Step 2: Provider submits
    yield { label: "Provider → POST /bounties/:id/submit", side: "provider", request: { evidenceUri: "ipfs://QmPlayground" } };
    const submitTx = await apiPost<{ txHash: string }>(
      `/bounties/${bounty.bountyId}/submit`,
      { evidenceUri: "ipfs://QmPlayground" },
      ctx.provider,
    );
    yield { label: "Provider ← Submission recorded", side: "provider", response: submitTx };

    // Step 3: Award
    yield { label: "Agent → POST /bounties/:id/award", side: "agent", request: { winner: ctx.provider.address } };
    const awardTx = await apiPost<{ txHash: string }>(
      `/bounties/${bounty.bountyId}/award`,
      { winner: ctx.provider.address },
      ctx.agent,
    );
    yield { label: "Provider ← Bounty awarded", side: "both", response: awardTx };

    const finalBounty = await apiGet<unknown>(`/bounties/${bounty.bountyId}`, ctx.agent);
    yield { label: "Bounty complete", side: "both", response: finalBounty };
  },
};
