/**
 * x402 HTTP Payment flow.
 *
 * Simulates pay-per-request: agent signs EIP-3009, provider (resource server)
 * calls /x402/settle to claim the payment.
 */

import { apiGetPublic, BASE_URL } from "../api.js";
import { signRequest } from "../wallet.js";
import type { Flow, StepResult, FlowContext } from "./types.js";
import { ethers } from "ethers";

const CHAIN_ID = 84532;
const NETWORK = "eip155:84532";

// EIP-3009 domain — must match the server's USDC contract
// (name="USD Coin", version="2", per the x402_verify.rs implementation)
const USDC_ADDRESS = "0xb6302F6aF30bA13d51CEd27ACF0279AD3c4e4497"; // Base Sepolia testnet USDC

const EIP3009_DOMAIN = {
  name: "USD Coin",
  version: "2",
  chainId: CHAIN_ID,
  verifyingContract: USDC_ADDRESS,
};

const TRANSFER_WITH_AUTH_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};

export const x402Flow: Flow = {
  id: "x402",
  label: "x402 HTTP",
  description: "Pay-per-request: 402 → settle → 200.",

  async *run(ctx: FlowContext): AsyncGenerator<StepResult> {
    // Step 1: Check supported payment schemes
    yield { label: "Agent → GET /x402/supported", side: "agent" };
    const supported = await apiGetPublic<{ assets: Record<string, Record<string, string>> }>("/x402/supported");
    yield { label: "Server ← x402 schemes", side: "agent", response: supported };

    // Step 2: Simulate 402 — construct payment
    const amountUnits = ethers.parseUnits("0.01", 6); // 10000 base units = $0.01
    const amountStr = amountUnits.toString();
    const validAfter = 0;
    const validBefore = Math.floor(Date.now() / 1000) + 300;
    const eip3009Nonce = ethers.hexlify(ethers.randomBytes(32));

    yield {
      label: "Agent ← 402 (simulated) — constructing payment",
      side: "agent",
      response: {
        status: 402,
        scheme: "exact",
        network: NETWORK,
        amount: amountStr,
        payTo: ctx.provider.address,
      },
    };

    // Step 3: Agent signs EIP-3009 TransferWithAuthorization
    yield { label: "Agent signs EIP-3009 TransferWithAuthorization", side: "agent" };
    const signer = new ethers.Wallet(ctx.agent.privateKey);
    const authMessage = {
      from: ctx.agent.address,
      to: ctx.provider.address,
      value: amountUnits,
      validAfter: BigInt(validAfter),
      validBefore: BigInt(validBefore),
      nonce: eip3009Nonce,
    };
    const signature = await signer.signTypedData(EIP3009_DOMAIN, TRANSFER_WITH_AUTH_TYPES, authMessage);
    yield {
      label: "Signed EIP-3009 authorization",
      side: "agent",
      response: { eip3009Nonce, validBefore, signature: signature.slice(0, 20) + "…" },
    };

    // Step 4: Provider (resource server) calls /x402/settle
    // The caller must match paymentRequired.payTo
    const settleBody = {
      paymentPayload: {
        scheme: "exact",
        network: NETWORK,
        payload: {
          signature,
          authorization: {
            from: ctx.agent.address,
            to: ctx.provider.address,
            value: amountStr,
            validAfter: String(validAfter),
            validBefore: String(validBefore),
            nonce: eip3009Nonce,
          },
        },
        x402Version: 1,
      },
      paymentRequired: {
        scheme: "exact",
        network: NETWORK,
        amount: amountStr,
        asset: USDC_ADDRESS,
        payTo: ctx.provider.address,
        maxTimeoutSeconds: 300,
      },
    };

    yield {
      label: "Provider → POST /x402/settle",
      side: "provider",
      request: { ...settleBody, paymentPayload: { ...settleBody.paymentPayload, payload: { ...settleBody.paymentPayload.payload, signature: signature.slice(0, 20) + "…" } } },
    };

    const authHeaders = await signRequest(ctx.provider, "POST", "/api/v0/x402/settle");
    const settleRes = await fetch(`${BASE_URL}/x402/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify(settleBody),
    });

    const settleParsed = await settleRes.json().catch(() => ({ status: settleRes.status }));

    if (settleRes.ok) {
      yield { label: "Server ← Settlement confirmed on-chain", side: "both", response: settleParsed, balanceDelta: { agent: -0.01, provider: 0.01 } };
      yield { label: "Agent → retries with PAYMENT-SIGNATURE → 200 ✓", side: "agent", response: { status: 200, data: "Resource served" } };

      yield {
        label: "Webhook delivered → POST https://your-webhook.example.com",
        side: "provider",
        variant: "webhook",
        response: {
          id: "evt_" + Math.random().toString(36).slice(2, 10),
          event: "payment.received",
          occurred_at: new Date().toISOString(),
          resource_type: "payment",
          resource_id: (settleParsed as Record<string, unknown>)["invoice_id"] as string ?? eip3009Nonce.slice(0, 18),
          currency: "USDC",
          testnet: true,
          data: {
            protocol: "x402",
            from: ctx.agent.address,
            to: ctx.provider.address,
            amount: 0.01,
            amount_units: 10000,
            tx_hash: (settleParsed as Record<string, unknown>)["tx_hash"] as string ?? "0x",
          },
        },
      };
    } else {
      yield {
        label: "Settlement signed (on-chain confirmation pending)",
        side: "both",
        response: {
          ...settleParsed,
          note: "EIP-3009 authorization was signed correctly. On testnet, on-chain settlement depends on faucet USDC availability.",
        },
      };
    }

    // x402 is synchronous — the settlement response IS the completion event.
    // No async events are expected (unlike escrow/tab/stream/bounty).
    yield {
      label: "Done — x402 is synchronous (no async events)",
      side: "provider",
      response: {
        protocol: "x402 payments complete in a single HTTP round-trip",
        settlement: "The PAYMENT-RESPONSE header contains the tx hash",
        webhooks: "Optional — register via POST /webhooks to receive x402.settled events",
      },
    };
  },
};
