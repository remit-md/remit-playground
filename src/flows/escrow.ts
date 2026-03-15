import { apiPost, apiGet } from "../api.js";
import type { Flow, StepResult, FlowContext } from "./types.js";
import { ethers } from "ethers";

export const escrowFlow: Flow = {
  id: "escrow",
  label: "Escrow",
  description: "Fund → claim-start → release lifecycle.",

  async *run(ctx: FlowContext): AsyncGenerator<StepResult> {
    const invoiceId = ethers.hexlify(ethers.randomBytes(16)).slice(2);
    const nonce = ethers.hexlify(ethers.randomBytes(16));

    // Step 1: Create invoice
    const invoiceReq = {
      id: invoiceId,
      from: ctx.agent.address,
      to: ctx.provider.address,
      amount: 2.0,
      type: "escrow",
      task: "playground escrow",
    };
    yield { label: "Agent → POST /invoices (create)", side: "agent", request: invoiceReq };

    await apiPost("/invoices", {
      id: invoiceId,
      chain: "base-sepolia",
      from_agent: ctx.agent.address.toLowerCase(),
      to_agent: ctx.provider.address.toLowerCase(),
      amount: 2.0,
      type: "escrow",
      task: "playground escrow",
      nonce,
      signature: "0x",
    }, ctx.agent);
    yield { label: "Server → 201 Invoice created", side: "agent", response: { invoiceId } };

    // Step 2: Fund escrow
    yield { label: "Agent → POST /escrows (fund)", side: "agent", request: { invoice_id: invoiceId } };
    const escrow = await apiPost<{ id: string; status: string }>("/escrows", { invoice_id: invoiceId }, ctx.agent);
    yield { label: "Agent ← Escrow funded on-chain", side: "agent", response: escrow, balanceDelta: { agent: -2.0 } };

    // Step 3: Provider claims start
    yield { label: "Provider → POST /escrows/:id/claim-start", side: "provider" };
    const claimTx = await apiPost<{ tx_hash: string }>(`/escrows/${invoiceId}/claim-start`, {}, ctx.provider);
    yield { label: "Provider ← Work started (tx confirmed)", side: "provider", response: claimTx };

    // Step 4: Agent releases escrow
    yield { label: "Agent → POST /escrows/:id/release (work done)", side: "agent" };
    const releaseTx = await apiPost<{ tx_hash: string }>(`/escrows/${invoiceId}/release`, {}, ctx.agent);
    yield { label: "Provider ← Funds released", side: "both", response: releaseTx, balanceDelta: { provider: 1.98 } };

    yield {
      label: "Webhook delivered → POST https://your-webhook.example.com",
      side: "both",
      variant: "webhook",
      response: {
        id: "evt_" + Math.random().toString(36).slice(2, 10),
        event: "escrow.released",
        occurred_at: new Date().toISOString(),
        resource_type: "escrow",
        resource_id: invoiceId,
        currency: "USDC",
        testnet: true,
        data: {
          invoice_id: invoiceId,
          amount: 2.0,
          amount_units: 2000000,
          tx_hash: releaseTx.tx_hash,
        },
      },
    };

    const finalEscrow = await apiGet<unknown>(`/escrows/${invoiceId}`, ctx.agent);
    yield { label: "Escrow settled", side: "both", response: finalEscrow };
  },
};
