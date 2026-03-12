/**
 * Thin authenticated fetch wrapper for remit.md API.
 */

import { signAuth, type PlaygroundWallet } from "./wallet.js";

export const BASE_URL = "https://remit.md/api/v0";

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`API error ${status}`);
  }
}

async function authedHeaders(w: PlaygroundWallet): Promise<Record<string, string>> {
  const auth = await signAuth(w);
  return {
    "Content-Type": "application/json",
    "X-Wallet": auth.wallet,
    "X-Nonce": auth.nonce,
    "X-Timestamp": String(auth.timestamp),
    "X-Signature": auth.signature,
  };
}

export async function apiPost<T>(path: string, body: unknown, wallet: PlaygroundWallet): Promise<T> {
  const headers = await authedHeaders(wallet);
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export async function apiGet<T>(path: string, wallet: PlaygroundWallet): Promise<T> {
  const headers = await authedHeaders(wallet);
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export async function apiGetPublic<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

/** Register wallet with server (no-op if already registered). */
export async function ensureRegistered(w: PlaygroundWallet): Promise<void> {
  const auth = await signAuth(w);
  const res = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      wallet: auth.wallet,
      nonce: auth.nonce,
      timestamp: auth.timestamp,
      signature: auth.signature,
    }),
  });
  // 200 = registered now, 409 = already registered — both OK
  if (!res.ok && res.status !== 409) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body);
  }
}

/** Request testnet USDC from faucet. */
export async function requestFaucet(address: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/faucet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet: address }),
  });
  if (!res.ok && res.status !== 429) {
    // 429 = already funded recently — acceptable
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body);
  }
}

interface WalletStatus {
  address: string;
  usdcBalance: number;
  balance: string;
  tier: string;
  totalVolume: number;
  escrowsActive: number;
  openTabs: number;
  activeStreams: number;
}

export async function getBalance(address: string, wallet: PlaygroundWallet): Promise<string> {
  const s = await apiGet<WalletStatus>(`/status/${address}`, wallet);
  return s.balance ?? String(s.usdcBalance ?? "0.00");
}
