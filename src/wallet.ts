/**
 * Minimal EIP-712 wallet for playground use.
 * Keys are stored in localStorage (testnet only).
 */

import { ethers } from "ethers";

export interface PlaygroundWallet {
  address: string;
  privateKey: string;
}

const CHAIN_ID = 84532; // Base Sepolia
const ROUTER_ADDRESS = "0x887536bD817B758f99F090a80F48032a24f50916";

const EIP712_DOMAIN = {
  name: "Remit",
  version: "1",
  chainId: CHAIN_ID,
  verifyingContract: ROUTER_ADDRESS,
};

const AUTH_TYPES = {
  Auth: [
    { name: "wallet", type: "address" },
    { name: "nonce", type: "bytes32" },
    { name: "timestamp", type: "uint256" },
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

export async function signAuth(w: PlaygroundWallet): Promise<{ wallet: string; nonce: string; timestamp: number; signature: string }> {
  const signer = new ethers.Wallet(w.privateKey);
  const nonce = ethers.hexlify(ethers.randomBytes(32));
  const timestamp = Math.floor(Date.now() / 1000);

  const message = { wallet: w.address, nonce, timestamp };
  const signature = await signer.signTypedData(EIP712_DOMAIN, AUTH_TYPES, message);

  return { wallet: w.address, nonce, timestamp, signature };
}
