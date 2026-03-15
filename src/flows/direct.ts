import { apiPost } from "../api.js";
import type { Flow, StepResult, FlowContext } from "./types.js";
import { ethers } from "ethers";

export const directFlow: Flow = {
  id: "direct",
  label: "Direct Payment",
  description: "Instant USDC transfer with no escrow.",

  async *run(ctx: FlowContext): AsyncGenerator<StepResult> {
    const nonce = ethers.hexlify(ethers.randomBytes(16));

    const req = { to: ctx.provider.address, amount: 1.0, task: "playground demo" };
    yield { label: "Agent → POST /payments/direct", side: "agent", request: req };

    const tx = await apiPost<{ tx_hash: string; invoice_id: string }>(
      "/payments/direct",
      {
        to: ctx.provider.address,
        amount: 1.0,
        task: "playground demo",
        chain: "base-sepolia",
        nonce,
        signature: "0x",
      },
      ctx.agent,
    );

    yield { label: "Server → 201 Transaction confirmed", side: "agent", response: tx, balanceDelta: { agent: -1.0, provider: 0.99 } };

    yield {
      label: "Webhook delivered → POST https://your-webhook.example.com",
      side: "agent",
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
          amount: 1.0,
          amount_units: 1000000,
        },
      },
    };

    yield {
      label: "Webhook delivered → POST https://your-webhook.example.com",
      side: "provider",
      variant: "webhook",
      response: {
        id: "evt_" + Math.random().toString(36).slice(2, 10),
        event: "payment.received",
        occurred_at: new Date().toISOString(),
        resource_type: "payment",
        resource_id: tx.invoice_id ?? "unknown",
        currency: "USDC",
        testnet: true,
        data: {
          tx_hash: tx.tx_hash,
          from: ctx.agent.address,
          to: ctx.provider.address,
          amount: 1.0,
          amount_units: 1000000,
        },
      },
    };
  },
};
