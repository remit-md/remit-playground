import { apiPost, apiGet } from "../api.js";
import type { Flow, StepResult, FlowContext } from "./types.js";

export const streamFlow: Flow = {
  id: "stream",
  label: "Stream",
  description: "Pay by the second — open, accrue, withdraw, close.",

  async *run(ctx: FlowContext): AsyncGenerator<StepResult> {
    // Step 1: Open stream
    const streamReq = { to: ctx.provider.address, rate: 0.001, maxDuration: 60 };
    yield { label: "Agent → POST /streams (open)", side: "agent", request: streamReq };

    const stream = await apiPost<{ streamId: string; status: string }>(
      "/streams",
      { to: ctx.provider.address, rate: 0.001, maxDuration: 60 },
      ctx.agent,
    );
    yield { label: "Stream opened @ $0.001/sec", side: "both", response: stream };

    // Step 2: Wait — funds accrue
    yield { label: "⏱ Funds accruing… (3s simulated)", side: "both" };
    await new Promise((r) => setTimeout(r, 3000));

    // Step 3: Provider withdraws accrued funds
    yield { label: "Provider → POST /streams/:id/withdraw", side: "provider" };
    const withdrawTx = await apiPost<{ txHash: string }>(`/streams/${stream.streamId}/withdraw`, {}, ctx.provider);
    yield { label: "Provider ← Accrued USDC withdrawn", side: "provider", response: withdrawTx };

    // Step 4: Agent closes stream
    yield { label: "Agent → POST /streams/:id/close", side: "agent" };
    const closeTx = await apiPost<{ txHash: string }>(`/streams/${stream.streamId}/close`, {}, ctx.agent);
    yield { label: "Stream closed — remainder returned", side: "both", response: closeTx };

    const finalStream = await apiGet<unknown>(`/streams/${stream.streamId}`, ctx.agent);
    yield { label: "Stream final state", side: "both", response: finalStream };
  },
};
