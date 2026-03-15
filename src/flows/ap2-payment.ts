/**
 * AP2 Payment via A2A flow.
 *
 * Demonstrates an autonomous agent paying another agent using the
 * Agent-to-Agent (A2A) protocol with an AP2 IntentMandate.
 *
 * Steps:
 *   1. Discover agent card (get A2A endpoint)
 *   2. Build an AP2 IntentMandate
 *   3. Sign + submit JSON-RPC message/send to POST /a2a
 *   4. Check task state with tasks/get
 */

import { signRequest } from "../wallet.js";
import type { Flow, StepResult, FlowContext } from "./types.js";
import { ethers } from "ethers";

const AGENT_BASE_URL = "https://remit.md";
const A2A_ENDPOINT = "https://remit.md/a2a";
const A2A_PATH = "/a2a"; // path used for EIP-712 signing

export const ap2PaymentFlow: Flow = {
  id: "ap2-payment",
  label: "AP2 Payment",
  description: "Pay via A2A message/send with an AP2 IntentMandate.",

  async *run(ctx: FlowContext): AsyncGenerator<StepResult> {
    // ── Step 1: Discover agent card ───────────────────────────────────────────
    yield {
      label: "Agent → GET /.well-known/agent-card.json",
      side: "agent",
      request: { url: `${AGENT_BASE_URL}/.well-known/agent-card.json` },
    };

    const cardRes = await fetch(`${AGENT_BASE_URL}/.well-known/agent-card.json`, {
      headers: { Accept: "application/json" },
    });

    if (!cardRes.ok) {
      yield {
        label: `Agent card discovery failed: HTTP ${cardRes.status}`,
        side: "agent",
        error: { status: cardRes.status },
      };
      return;
    }

    const card = (await cardRes.json()) as { url: string; name: string };

    yield {
      label: "Server ← Agent card: A2A endpoint discovered",
      side: "agent",
      response: { name: card.name, a2aEndpoint: card.url },
    };

    // ── Step 2: Build IntentMandate ───────────────────────────────────────────
    const mandateId = ethers.hexlify(ethers.randomBytes(16)).slice(2); // 32-char hex
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // +5 min

    const mandate = {
      mandateId,
      expiresAt,
      issuer: ctx.agent.address,
      allowance: {
        maxAmount: "5.00",
        currency: "USDC",
      },
    };

    yield {
      label: "Agent constructs AP2 IntentMandate",
      side: "agent",
      response: {
        mandateId: mandate.mandateId,
        expiresAt: mandate.expiresAt,
        issuer: mandate.issuer,
        allowance: mandate.allowance,
      },
    };

    // ── Step 3: Build JSON-RPC message/send payload ───────────────────────────
    const messageId = ethers.hexlify(ethers.randomBytes(16)).slice(2);
    const nonce = ethers.hexlify(ethers.randomBytes(16));

    const rpcBody = {
      jsonrpc: "2.0",
      id: `playground-${messageId.slice(0, 8)}`,
      method: "message/send",
      params: {
        message: {
          messageId,
          role: "user",
          parts: [
            {
              kind: "data",
              data: {
                model: "direct",
                to: ctx.provider.address,
                amount: "1.00",
                memo: "AP2 playground demo",
                nonce,
              },
            },
          ],
          metadata: {
            ap2Mandate: mandate,
          },
        },
      },
    };

    const displayBody = {
      ...rpcBody,
      params: {
        message: {
          ...rpcBody.params.message,
          metadata: { ap2Mandate: { ...mandate, issuer: mandate.issuer.slice(0, 10) + "…" } },
        },
      },
    };

    yield {
      label: "Agent → POST /a2a (message/send)",
      side: "agent",
      request: displayBody,
    };

    // ── Step 4: Sign and submit ───────────────────────────────────────────────
    const authHeaders = await signRequest(ctx.agent, "POST", A2A_PATH);

    const rpcRes = await fetch(A2A_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify(rpcBody),
    });

    const rpcData = (await rpcRes.json().catch(() => ({ status: rpcRes.status }))) as {
      result?: { task?: { id: string; status: { state: string; message?: string }; artifacts?: Array<{ parts: Array<{ data: Record<string, unknown> }> }> } };
      error?: { code: number; message: string };
    };

    if (rpcData.error) {
      yield {
        label: `A2A error: ${rpcData.error.message}`,
        side: "agent",
        error: rpcData.error,
      };
      return;
    }

    const task = rpcData.result?.task;
    if (!task) {
      yield {
        label: "Unexpected A2A response",
        side: "agent",
        error: rpcData,
      };
      return;
    }

    // Extract tx hash from artifact parts
    const txHash = task.artifacts
      ?.flatMap((a) => a.parts)
      .find((p) => p.data?.txHash)
      ?.data?.txHash as string | undefined;

    if (task.status.state === "completed") {
      yield {
        label: "Server ← Task completed — payment submitted on-chain",
        side: "agent",
        response: {
          taskId: task.id,
          state: task.status.state,
          txHash,
          message: task.status.message,
        },
        balanceDelta: { agent: -1.0, provider: 0.99 },
      };
    } else {
      yield {
        label: `Server ← Task ${task.status.state}`,
        side: "agent",
        response: {
          taskId: task.id,
          state: task.status.state,
          message: task.status.message,
          note: "On testnet, payment requires funded wallet. Run faucet first.",
        },
      };
      return;
    }

    // ── Step 5: Check task state with tasks/get ────────────────────────────────
    yield {
      label: "Agent → tasks/get (verify task persisted in Redis)",
      side: "agent",
    };

    const getHeaders = await signRequest(ctx.agent, "POST", A2A_PATH);
    const getRes = await fetch(A2A_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getHeaders },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "get-1",
        method: "tasks/get",
        params: { id: task.id },
      }),
    });

    const getData = (await getRes.json().catch(() => null)) as {
      result?: { task?: { status: { state: string } } };
      error?: { message: string };
    } | null;

    const retrievedState = getData?.result?.task?.status?.state ?? getData?.error?.message ?? "unknown";

    yield {
      label: `Server ← tasks/get: state = ${retrievedState}`,
      side: "agent",
      response: { taskId: task.id, state: retrievedState },
    };
  },
};
