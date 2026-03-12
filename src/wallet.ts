/**
 * Minimal EIP-712 wallet for playground use.
 * Keys are stored in localStorage (testnet only).
 *
 * Auth scheme matches the server exactly:
 *   domain  — name:"remit.md", version:"0.1", chainId, verifyingContract
 *   type    — APIRequest(string method, string path, uint256 timestamp, bytes32 nonce)
 */

import { ethers } from "ethers";

export interface PlaygroundWallet {
  address: string;
  privateKey: string;
}

const CHAIN_ID = 84532; // Base Sepolia
const ROUTER_ADDRESS = "0x887536bD817B758f99F090a80F48032a24f50916";

const EIP712_DOMAIN = {
  name: "remit.md",
  version: "0.1",
  chainId: CHAIN_ID,
  verifyingContract: ROUTER_ADDRESS,
};

const API_REQUEST_TYPES = {
  APIRequest: [
    { name: "method", type: "string" },
    { name: "path", type: "string" },
    { name: "timestamp", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};

export function loadOrCreate(storageKey: string): PlaygroundWallet {
  const stored = localStorage.getItem(storageKey);
  if (stored) {
    const w = JSON.parse(stored) as PlaygroundWallet;
    return w;
  }
  const wallet = ethers.Wallet.createRandom();
  const w: PlaygroundWallet = { address: wallet.address, privateKey: wallet.privateKey };
  localStorage.setItem(storageKey, JSON.stringify(w));
  return w;
}

export interface AuthHeaders {
  "X-Remit-Agent": string;
  "X-Remit-Nonce": string;
  "X-Remit-Timestamp": string;
  "X-Remit-Signature": string;
}

/** Sign an API request using EIP-712, returning ready-to-use auth headers. */
export async function signRequest(
  w: PlaygroundWallet,
  method: string,
  path: string,
): Promise<AuthHeaders> {
  const signer = new ethers.Wallet(w.privateKey);
  const nonce = ethers.hexlify(ethers.randomBytes(32));
  const timestamp = Math.floor(Date.now() / 1000);

  const message = { method: method.toUpperCase(), path, timestamp, nonce };
  const signature = await signer.signTypedData(EIP712_DOMAIN, API_REQUEST_TYPES, message);

  return {
    "X-Remit-Agent": w.address,
    "X-Remit-Nonce": nonce,
    "X-Remit-Timestamp": String(timestamp),
    "X-Remit-Signature": signature,
  };
}
