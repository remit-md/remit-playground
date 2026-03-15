/**
 * API endpoint definitions for the reference section.
 * Each category groups related endpoints with request builders
 * that use the playground wallets for live "Try" requests.
 */

import type { PlaygroundWallet } from "../wallet.js";

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export interface EndpointDef {
  method: HttpMethod;
  path: string;
  description: string;
  /** If true, the Try button fires a real request. */
  tryable: boolean;
  /** Build request body (POST) or query params (GET). */
  buildRequest?: (agent: PlaygroundWallet, provider: PlaygroundWallet) => unknown;
  /** Override the path at runtime (e.g. to interpolate wallet address). */
  buildPath?: (agent: PlaygroundWallet, provider: PlaygroundWallet) => string;
  /** Auth wallet to use: "agent" (default) or "provider". */
  authAs?: "agent" | "provider";
  /** If true, endpoint is at server root (no /api/v0 prefix). */
  publicRoot?: boolean;
  /** If true, endpoint needs no auth headers. */
  noAuth?: boolean;
}

export interface Category {
  name: string;
  endpoints: EndpointDef[];
}

export function buildCategories(): Category[] {
  return [
    {
      name: "Health & Status",
      endpoints: [
        {
          method: "GET",
          path: "/health",
          description: "Service health check — Postgres, Redis, chain latencies.",
          tryable: true,
          publicRoot: true,
          noAuth: true,
          buildPath: () => "/health",
        },
        {
          method: "GET",
          path: "/status/{wallet}",
          description: "Wallet state: balance, volume, tier, active contracts.",
          tryable: true,
          buildPath: (agent) => `/status/${agent.address}`,
        },
      ],
    },
    {
      name: "Faucet",
      endpoints: [
        {
          method: "POST",
          path: "/faucet",
          description: "Drip testnet USDC (max 1000, 1 req/hr per wallet).",
          tryable: true,
          noAuth: true,
          buildRequest: (agent) => ({ wallet: agent.address }),
        },
      ],
    },
    {
      name: "Payments",
      endpoints: [
        {
          method: "POST",
          path: "/payments/direct",
          description: "Instant USDC transfer — no escrow, no hold.",
          tryable: true,
          buildRequest: (agent, provider) => ({
            to: provider.address,
            amount: "0.01",
            task: "playground-api-ref-test",
            chain: "base-sepolia",
            nonce: crypto.randomUUID(),
            signature: "0x",
            metadata: { source: "playground" },
          }),
        },
      ],
    },
    {
      name: "Escrow",
      endpoints: [
        {
          method: "GET",
          path: "/escrows",
          description: "List escrows for authenticated wallet.",
          tryable: true,
        },
        {
          method: "POST",
          path: "/escrows",
          description: "Fund new escrow — locks USDC until release or cancel.",
          tryable: true,
          buildRequest: (_agent, provider) => ({
            chain: "base-sepolia",
            payee: provider.address,
            amount: "0.10",
            task: "playground-escrow-test",
            timeout: 3600,
            nonce: crypto.randomUUID(),
            signature: "0x",
          }),
        },
        {
          method: "POST",
          path: "/escrows/{id}/claim-start",
          description: "Payee marks work done, starts claim window.",
          tryable: false,
        },
        {
          method: "POST",
          path: "/escrows/{id}/release",
          description: "Payer releases escrowed funds to payee.",
          tryable: false,
        },
        {
          method: "POST",
          path: "/escrows/{id}/cancel",
          description: "Payer cancels escrow (before claim started).",
          tryable: false,
        },
      ],
    },
    {
      name: "Tabs",
      endpoints: [
        {
          method: "GET",
          path: "/tabs",
          description: "List tabs for authenticated wallet.",
          tryable: true,
        },
        {
          method: "POST",
          path: "/tabs",
          description: "Open a metered payment channel with a provider.",
          tryable: true,
          buildRequest: (_agent, provider) => ({
            chain: "base-sepolia",
            provider: provider.address,
            limit: "1.00",
            per_unit: "0.01",
          }),
        },
        {
          method: "POST",
          path: "/tabs/{id}/charge",
          description: "Provider charges against an open tab.",
          tryable: false,
        },
        {
          method: "POST",
          path: "/tabs/{id}/close",
          description: "Close tab and finalize charges.",
          tryable: false,
        },
      ],
    },
    {
      name: "Streams",
      endpoints: [
        {
          method: "GET",
          path: "/streams",
          description: "List streams for authenticated wallet.",
          tryable: true,
        },
        {
          method: "POST",
          path: "/streams",
          description: "Open lockup-linear USDC stream to payee.",
          tryable: true,
          buildRequest: (_agent, provider) => ({
            chain: "base-sepolia",
            payee: provider.address,
            rate_per_second: "0.001",
            max_total: "0.06",
          }),
        },
        {
          method: "POST",
          path: "/streams/{id}/withdraw",
          description: "Payee withdraws accrued stream balance.",
          tryable: false,
        },
        {
          method: "POST",
          path: "/streams/{id}/close",
          description: "Payer closes stream and settles accrued amount.",
          tryable: false,
        },
      ],
    },
    {
      name: "Bounties",
      endpoints: [
        {
          method: "GET",
          path: "/bounties",
          description: "List all bounties (public, filterable by status).",
          tryable: true,
        },
        {
          method: "POST",
          path: "/bounties",
          description: "Post a bounty — locked until awarded or reclaimed.",
          tryable: true,
          buildRequest: () => ({
            chain: "base-sepolia",
            amount: "0.25",
            task_description: "playground-bounty-test",
            deadline: Math.floor(Date.now() / 1000) + 7200,
          }),
        },
        {
          method: "POST",
          path: "/bounties/{id}/submit",
          description: "Submit a solution for an open bounty.",
          tryable: false,
        },
        {
          method: "POST",
          path: "/bounties/{id}/award",
          description: "Award bounty to a submitter.",
          tryable: false,
        },
        {
          method: "POST",
          path: "/bounties/{id}/reclaim",
          description: "Reclaim bounty funds after deadline.",
          tryable: false,
        },
      ],
    },
    {
      name: "Deposits",
      endpoints: [
        {
          method: "GET",
          path: "/deposits",
          description: "List deposits for authenticated wallet.",
          tryable: true,
        },
        {
          method: "POST",
          path: "/deposits",
          description: "Lock refundable collateral deposit.",
          tryable: true,
          buildRequest: (_agent, provider) => ({
            chain: "base-sepolia",
            provider: provider.address,
            amount: "0.50",
            expiry: Math.floor(Date.now() / 1000) + 3600,
          }),
        },
        {
          method: "POST",
          path: "/deposits/{id}/return",
          description: "Provider returns deposit to depositor.",
          tryable: false,
        },
        {
          method: "POST",
          path: "/deposits/{id}/forfeit",
          description: "Provider forfeits deposit.",
          tryable: false,
        },
      ],
    },
    {
      name: "Events (SSE)",
      endpoints: [
        {
          method: "GET",
          path: "/events/stream",
          description: "SSE stream — real-time events for authenticated wallet. Same payload as webhooks. Max 10 connections, auto-closes after 30 min. Use fetch + ReadableStream (EventSource doesn't support custom headers).",
          tryable: false,
        },
      ],
    },
    {
      name: "Webhooks",
      endpoints: [
        {
          method: "GET",
          path: "/webhooks",
          description: "List registered webhook subscriptions.",
          tryable: true,
        },
        {
          method: "POST",
          path: "/webhooks",
          description: "Register webhook — receive signed event POSTs to your URL. Requires ≥1 event type.",
          tryable: true,
          buildRequest: () => ({
            url: "https://example.com/webhook",
            events: ["payment.received", "payment.sent"],
            chains: ["base-sepolia"],
          }),
        },
        {
          method: "PATCH",
          path: "/webhooks/{id}",
          description: "Update webhook — change URL, events, chains, or active status.",
          tryable: false,
        },
        {
          method: "DELETE",
          path: "/webhooks/{id}",
          description: "Delete a webhook registration.",
          tryable: false,
        },
      ],
    },
    {
      name: "Links",
      endpoints: [
        {
          method: "POST",
          path: "/links/fund",
          description: "Create one-time fund link (1-hour expiry).",
          tryable: true,
          buildRequest: () => ({ chain: "base-sepolia" }),
        },
        {
          method: "POST",
          path: "/links/withdraw",
          description: "Create one-time withdraw link (1-hour expiry).",
          tryable: true,
          buildRequest: () => ({ chain: "base-sepolia" }),
        },
      ],
    },
    {
      name: "x402",
      endpoints: [
        {
          method: "GET",
          path: "/x402/supported",
          description: "Discovery: supported schemes, networks, assets.",
          tryable: true,
          noAuth: true,
        },
        {
          method: "POST",
          path: "/x402/verify",
          description: "Validate EIP-3009 payment authorization.",
          tryable: false,
        },
        {
          method: "POST",
          path: "/x402/settle",
          description: "Verify and settle x402 payment on-chain.",
          tryable: false,
        },
      ],
    },
  ];
}
