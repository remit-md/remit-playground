import { apiPost, apiGet } from "../api.js";
import type { Flow, StepResult, FlowContext } from "./types.js";
import { ethers } from "ethers";

export const bountyFlow: Flow = {
  id: "bounty",
  label: "Bounty",
  description: "Post a task, submit work, award payment.",

  async *run(ctx: FlowContext): AsyncGenerator<StepResult> {
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes("playground haiku submission"));

    // Step 1: Post bounty
    const bountyReq = { amount: 3.0, task_description: "Write a haiku about USDC", deadline };
    yield { label: "Agent → POST /bounties (post)", side: "agent", request: bountyReq };

    const bounty = await apiPost<{ id: string; status: string }>(
      "/bounties",
      {
        chain: "base-sepolia",
        amount: 3.0,
        task_description: "Write a haiku about USDC",
        deadline,
        max_attempts: 10,
      },
      ctx.agent,
    );
    yield { label: "Bounty posted — USDC locked", side: "both", response: bounty };

    // Step 2: Provider submits evidence
    const submitReq = { evidence_hash: evidenceHash };
    yield { label: "Provider → POST /bounties/:id/submit", side: "provider", request: submitReq };
    const submission = await apiPost<{ id: number; status: string }>(
      `/bounties/${bounty.id}/submit`,
      submitReq,
      ctx.provider,
    );
    yield { label: "Provider ← Submission recorded", side: "provider", response: submission };

    // Step 3: Agent awards to winning submission
    const awardReq = { submission_id: submission.id };
    yield { label: "Agent → POST /bounties/:id/award", side: "agent", request: awardReq };
    const awardTx = await apiPost<{ id: string; status: string }>(
      `/bounties/${bounty.id}/award`,
      awardReq,
      ctx.agent,
    );
    yield { label: "Provider ← Bounty awarded", side: "both", response: awardTx };

    const finalBounty = await apiGet<unknown>(`/bounties/${bounty.id}`, ctx.agent);
    yield { label: "Bounty complete", side: "both", response: finalBounty };
  },
};
