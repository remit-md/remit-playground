/**
 * Thin authenticated fetch wrapper for remit.md API.
 */

import { signRequest, type PlaygroundWallet } from "./wallet.js";

export const BASE_URL = "https://remit.md/api/v0";

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`API error ${status}`);
  }
}

export async function apiPost<T>(path: string, body: unknown, wallet: PlaygroundWallet): Promise<T> {
  const authHeaders = await signRequest(wallet, "POST", `/api/v0${path}`);
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export async function apiGet<T>(path: string, wallet: PlaygroundWallet): Promise<T> {
  const authHeaders = await signRequest(wallet, "GET", `/api/v0${path}`);
  const res = await fetch(`${BASE_URL}${path}`, { headers: authHeaders });
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
  wallet: string;
  balance: string;
  monthly_volume: number;
  tier: string;
  fee_rate_bps: number;
  active_escrows: number;
  active_tabs: number;
  active_streams: number;
}

export async function getBalance(address: string, wallet: PlaygroundWallet): Promise<string> {
  const s = await apiGet<WalletStatus>(`/status/${address}`, wallet);
  return s.balance ?? "0.00";
}
