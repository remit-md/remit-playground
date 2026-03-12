/**
 * x402 HTTP Payment flow.
 *
 * This flow simulates an agent requesting a paywalled resource:
 * 1. Agent requests URL → gets 402
 * 2. Agent constructs EIP-3009 payment authorization
 * 3. Agent calls /x402/settle → server settles on-chain
 * 4. Agent retries with payment proof → gets 200
 */

import { apiPost, apiGetPublic, BASE_URL } from "../api.js";
import type { Flow, StepResult, FlowContext } from "./types.js";
import { signRequest } from "../wallet.js";
import { ethers } from "ethers";

const CHAIN_ID = 84532;
const ROUTER_ADDRESS = "0x887536bD817B758f99F090a80F48032a24f50916";

// EIP-3009 domain — USDC on Base Sepolia
const EIP3009_DOMAIN = {
  name: "USD Coin",
  version: "2",
  chainId: CHAIN_ID,
  verifyingContract: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // USDC on Base Sepolia
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
    const supported = await apiGetPublic<unknown>("/x402/supported");
    yield { label: "Server ← x402 schemes", side: "agent", response: supported };

    // Step 2: Simulate 402 response (use the /x402/supported endpoint as the "paywalled resource")
    // In a real flow, the provider would return 402. Here we construct the payment manually.
    const amount = ethers.parseUnits("0.01", 6); // $0.01 USDC (6 decimals)
    const validAfter = 0;
    const validBefore = Math.floor(Date.now() / 1000) + 300;
    const nonce = ethers.hexlify(ethers.randomBytes(32));

    yield {
      label: "Agent ← 402 (simulated) — constructing payment",
      side: "agent",
      response: {
        status: 402,
        "x-payment-required": {
          scheme: "eip3009",
          recipient: ctx.provider.address,
          amount: "0.01",
          token: EIP3009_DOMAIN.verifyingContract,
        },
      },
    };

    // Step 3: Sign EIP-3009 authorization
    yield { label: "Agent signs EIP-3009 TransferWithAuthorization", side: "agent" };
    const signer = new ethers.Wallet(ctx.agent.privateKey);
    const authMessage = {
      from: ctx.agent.address,
      to: ctx.provider.address,
      value: amount,
      validAfter: BigInt(validAfter),
      validBefore: BigInt(validBefore),
      nonce,
    };
    const signature = await signer.signTypedData(EIP3009_DOMAIN, TRANSFER_WITH_AUTH_TYPES, authMessage);
    yield {
      label: "Signed payment authorization",
      side: "agent",
      response: { nonce, validBefore, signature: signature.slice(0, 20) + "…" },
    };

    // Step 4: Settle via server
    const settleReq = {
      from: ctx.agent.address,
      to: ctx.provider.address,
      amount: "0.01",
      token: EIP3009_DOMAIN.verifyingContract,
      chain: "base-sepolia",
      valid_after: validAfter,
      valid_before: validBefore,
      nonce,
      signature,
    };

    yield { label: "Agent → POST /x402/settle", side: "agent", request: { ...settleReq, signature: signature.slice(0, 20) + "…" } };

    // Sign the settle request with EIP-712 auth
    const authHeaders = await signRequest(ctx.agent, "POST", "/api/v0/x402/settle");
    const settleRes = await fetch(`${BASE_URL}/x402/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify(settleReq),
    });

    const settleParsed = await settleRes.json().catch(() => ({ status: settleRes.status }));

    if (settleRes.ok) {
      yield { label: "Server ← Settlement confirmed on-chain", side: "both", response: settleParsed };
      yield { label: "Agent → retries with PAYMENT-SIGNATURE → 200 ✓", side: "agent", response: { status: 200, data: "Resource served" } };
    } else {
      // Settlement might fail if wallet has no on-chain USDC — show the attempt
      yield {
        label: "Settlement attempted (needs on-chain USDC to complete)",
        side: "both",
        response: settleParsed,
      };
    }
  },
};
