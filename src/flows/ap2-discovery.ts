/**
 * AP2 Agent Discovery flow.
 *
 * Shows how an autonomous agent discovers another agent's payment capabilities
 * by fetching the A2A agent card from /.well-known/agent-card.json.
 * No authentication required — agent cards are public.
 */

import type { Flow, StepResult, FlowContext } from "./types.js";

const AGENT_BASE_URL = "https://remit.md";

export const ap2DiscoveryFlow: Flow = {
  id: "ap2-discovery",
  label: "AP2 Discovery",
  description: "Discover an agent's payment capabilities via A2A agent card.",

  async *run(_ctx: FlowContext): AsyncGenerator<StepResult> {
    // Step 1: Fetch the agent card
    yield {
      label: "Agent → GET /.well-known/agent-card.json",
      side: "agent",
      request: { url: `${AGENT_BASE_URL}/.well-known/agent-card.json` },
    };

    const res = await fetch(`${AGENT_BASE_URL}/.well-known/agent-card.json`, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      yield {
        label: `Discovery failed: HTTP ${res.status}`,
        side: "agent",
        error: { status: res.status },
      };
      return;
    }

    const card = (await res.json()) as {
      name: string;
      description: string;
      url: string;
      version: string;
      protocolVersion: string;
      capabilities: {
        extensions?: Array<{ uri: string; description: string; required: boolean }>;
        stateTransitionHistory?: boolean;
      };
      skills: Array<{ id: string; name: string; description: string }>;
      x402?: {
        settleEndpoint: string;
        fees?: { standardBps: number; preferredBps: number; cliffUsd: number };
      };
    };

    yield {
      label: "Server ← 200 Agent card received",
      side: "agent",
      response: {
        name: card.name,
        a2aEndpoint: card.url,
        protocolVersion: card.protocolVersion,
        version: card.version,
      },
    };

    // Step 2: Parse AP2 extensions
    const ap2Ext = card.capabilities?.extensions?.find((e) =>
      e.uri.includes("ap2-protocol.org"),
    );

    yield {
      label: "Agent parses AP2 capability extension",
      side: "agent",
      response: ap2Ext
        ? {
            ap2Extension: ap2Ext.uri,
            description: ap2Ext.description,
            required: ap2Ext.required,
          }
        : { note: "No AP2 extension declared in agent card" },
    };

    // Step 3: Parse available skills
    yield {
      label: `Agent enumerates ${card.skills?.length ?? 0} skill(s)`,
      side: "agent",
      response: {
        skills: (card.skills ?? []).map((s) => ({ id: s.id, name: s.name })),
      },
    };

    // Step 4: Show x402 payment details if available
    if (card.x402) {
      const fees = card.x402.fees;
      yield {
        label: "Agent reads x402 payment parameters",
        side: "agent",
        response: {
          settleEndpoint: card.x402.settleEndpoint,
          fees: fees
            ? {
                standardBps: fees.standardBps,
                preferredBps: fees.preferredBps,
                cliffUsd: fees.cliffUsd,
              }
            : undefined,
        },
      };
    }

    // Step 5: Summarise what the agent now knows
    yield {
      label: "Discovery complete — agent is ready to pay",
      side: "both",
      response: {
        a2aEndpoint: card.url,
        supportsAP2: !!ap2Ext,
        supportsX402: !!card.x402,
        preferredModel: "A2A message/send",
        nextStep: "POST /a2a with JSON-RPC message/send",
      },
    };
  },
};
