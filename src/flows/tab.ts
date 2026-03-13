import { ethers } from "ethers";
import { apiPost, apiGet, pollEvents } from "../api.js";
import type { Flow, StepResult, FlowContext } from "./types.js";

const PER_UNIT = 0.5;
const LIMIT = 10;

const TAB_CONTRACT = "0x3caC3F19904b68eefaD39df70da513cF04725126";
const TAB_EIP712_DOMAIN = {
  name: "RemitTab",
  version: "1",
  chainId: 84532,
  verifyingContract: TAB_CONTRACT,
};
const TAB_CHARGE_TYPES = {
  TabCharge: [
    { name: "tabId", type: "bytes32" },
    { name: "totalCharged", type: "uint96" },
    { name: "callCount", type: "uint32" },
  ],
};

/** Convert UUID string to bytes32 using the same encoding as the server (UTF-8 padded). */
function uuidToBytes32(uuid: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(uuid);
  const padded = new Uint8Array(32);
  padded.set(bytes.slice(0, 32));
  return ethers.hexlify(padded);
}

export const tabFlow: Flow = {
  id: "tab",
  label: "Metered Tab",
  description: "Open a tab, charge per API call, close to settle.",

  async *run(ctx: FlowContext): AsyncGenerator<StepResult> {
    const startTs = Math.floor(Date.now() / 1000);
    const expiry = Math.floor(Date.now() / 1000) + 3600;
    const tabReq = { provider: ctx.provider.address, limit_amount: LIMIT, per_unit: PER_UNIT, expiry };
    yield { label: "Agent → POST /tabs (open)", side: "agent", request: tabReq };

    const tab = await apiPost<{ id: string; status: string }>(
      "/tabs",
      { chain: "base-sepolia", provider: ctx.provider.address, limit_amount: LIMIT, per_unit: PER_UNIT, expiry },
      ctx.agent,
    );
    yield { label: "Tab opened", side: "both", response: tab };

    let cumulative = 0;
    let callCount = 0;
    for (let i = 1; i <= 2; i++) {
      cumulative = +(PER_UNIT * i).toFixed(6);
      callCount = i;
      const chargeReq = { amount: PER_UNIT, cumulative, call_count: i, provider_sig: "0x" };
      yield { label: `Provider → POST /tabs/:id/charge (call ${i})`, side: "provider", request: chargeReq };
      const chargeRes = await apiPost<unknown>(`/tabs/${tab.id}/charge`, chargeReq, ctx.provider);
      yield { label: `Charge ${i} accepted`, side: "provider", response: chargeRes };
    }

    // Provider signs the final cumulative state (EIP-712 TabCharge).
    const tabIdBytes32 = uuidToBytes32(tab.id);
    const totalChargedMicro = BigInt(Math.round(cumulative * 1_000_000));
    const providerSigner = new ethers.Wallet(ctx.provider.privateKey);
    const providerSig = await providerSigner.signTypedData(
      TAB_EIP712_DOMAIN,
      TAB_CHARGE_TYPES,
      { tabId: tabIdBytes32, totalCharged: totalChargedMicro, callCount },
    );

    yield { label: "Agent → POST /tabs/:id/close", side: "agent" };
    const closeTx = await apiPost<{ id: string }>(
      `/tabs/${tab.id}/close`,
      { final_amount: cumulative, provider_sig: providerSig },
      ctx.agent,
    );
    yield { label: "Tab closed — USDC settled on-chain", side: "both", response: closeTx, balanceDelta: { agent: -cumulative, provider: +(cumulative * 0.99).toFixed(2) } };

    yield { label: "Provider → GET /events (poll with retry)", side: "provider" };
    const events = await pollEvents(ctx.provider, startTs);
    yield { label: `Provider ← ${events.length} event(s)`, side: "provider", response: events[0] ?? { note: "no events after retries" } };

    const finalTab = await apiGet<unknown>(`/tabs/${tab.id}`, ctx.agent);
    yield { label: "Tab final state", side: "both", response: finalTab };
  },
};
