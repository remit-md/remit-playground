/**
 * SSE Events flow — demonstrates the real-time event stream.
 *
 * Connects to GET /api/v0/events/stream, triggers a payment, and shows
 * the resulting event. Directs users to the Events tab for persistent monitoring.
 */

import { apiPost, BASE_URL } from "../api.js";
import { signRequest } from "../wallet.js";
import type { Flow, StepResult, FlowContext } from "./types.js";
import { ethers } from "ethers";

export const sseEventsFlow: Flow = {
  id: "sse-events",
  label: "SSE Events",
  description: "Real-time event streaming via SSE — subscribe once, receive all events instantly.",

  async *run(ctx: FlowContext): AsyncGenerator<StepResult> {
    // Step 1: Show connection setup
    yield {
      label: "Agent → GET /api/v0/events/stream",
      side: "agent",
      request: {
        note: "EventSource doesn't support custom headers. Use fetch + ReadableStream.",
        auth: "X-Remit-Agent + X-Remit-Signature (EIP-712)",
        response_format: "text/event-stream",
        max_connections: 10,
        keepalive_interval: "15s",
        auto_close: "30 min",
      },
    };

    // Step 2: Attempt SSE connection
    const abort = new AbortController();
    let sseReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    try {
      const authHeaders = await signRequest(ctx.agent, "GET", "/api/v0/events/stream");
      const res = await fetch(`${BASE_URL}/events/stream`, {
        headers: authHeaders,
        signal: abort.signal,
      });

      if (res.ok && res.body) {
        sseReader = res.body.getReader();
        yield {
          label: "SSE stream connected ✓",
          side: "agent",
          response: { status: 200, content_type: "text/event-stream", streaming: true },
        };
      } else {
        yield {
          label: `SSE connection: HTTP ${res.status}`,
          side: "agent",
          response: { note: "Stream unavailable — showing simulated event below." },
        };
      }
    } catch {
      yield {
        label: "SSE connection attempt (showing simulated event)",
        side: "agent",
        response: { note: "Connect the Events tab to monitor the live stream." },
      };
    }

    // Step 3: Trigger a real payment (generates events)
    const nonce = ethers.hexlify(ethers.randomBytes(16));
    yield {
      label: "Agent → POST /payments/direct (to trigger event)",
      side: "agent",
      request: { to: ctx.provider.address, amount: 0.01, task: "sse-demo" },
    };

    const tx = await apiPost<{ tx_hash: string; invoice_id: string }>(
      "/payments/direct",
      {
        to: ctx.provider.address,
        amount: 0.01,
        task: "sse-demo",
        chain: "base-sepolia",
        nonce,
        signature: "0x",
      },
      ctx.agent,
    );
    yield {
      label: "Payment sent — event emitted to all SSE subscribers",
      side: "agent",
      response: tx,
      balanceDelta: { agent: -0.01, provider: 0.0099 },
    };

    // Step 4: Read from SSE (if connected) or show simulated event
    yield { label: "⏱ Waiting for SSE event…", side: "both" };

    let receivedEvent: Record<string, unknown> | null = null;

    if (sseReader) {
      const decoder = new TextDecoder();
      let buffer = "";
      const deadline = Date.now() + 7000;

      try {
        while (Date.now() < deadline && !receivedEvent) {
          const timeLeft = deadline - Date.now();
          const readPromise = sseReader.read();
          const timeoutPromise = new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), Math.min(timeLeft, 2000)),
          );

          const result = await Promise.race([readPromise, timeoutPromise]);
          if (!result || result.done) break;

          buffer += decoder.decode(result.value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const json = JSON.parse(line.slice(6)) as Record<string, unknown>;
                if (json["event"] !== "keepalive") {
                  receivedEvent = json;
                }
              } catch {
                // skip malformed line
              }
            }
          }
        }
      } catch {
        // stream closed
      } finally {
        abort.abort();
      }
    }

    if (receivedEvent) {
      yield {
        label: "SSE event received live ✓",
        side: "both",
        variant: "webhook",
        response: receivedEvent,
      };
    } else {
      // Simulated payload — same format as what the stream delivers
      yield {
        label: "SSE event (simulated — same format as live stream)",
        side: "both",
        variant: "webhook",
        response: {
          id: "evt_" + Math.random().toString(36).slice(2, 10),
          event: "payment.sent",
          occurred_at: new Date().toISOString(),
          resource_type: "payment",
          resource_id: tx.invoice_id ?? "unknown",
          currency: "USDC",
          testnet: true,
          data: {
            tx_hash: tx.tx_hash,
            from: ctx.agent.address,
            to: ctx.provider.address,
            amount: 0.01,
            amount_units: 10000,
          },
        },
      };
    }

    // Step 5: Tip
    yield {
      label: "→ Open the Events tab to watch the live SSE stream",
      side: "both",
      response: {
        tip: "The Events tab stays connected across all flows — run any payment flow and watch events arrive in real time.",
        also: "Register a webhook (POST /webhooks) to receive events at your own endpoint.",
      },
    };
  },
};
