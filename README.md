# remit.md Playground

Interactive demonstration of all 7 payment flows supported by [remit.md](https://remit.md).

## What It Shows

| Flow | Description |
|------|-------------|
| x402 HTTP | Pay-per-request: 402 → settle → 200 |
| Direct Payment | Instant USDC transfer |
| Escrow | Fund → claim-start → release |
| Metered Tab | Open → charge per call → close |
| Stream | Pay by the second |
| Bounty | Post task → submit → award |
| Deposit | Lock → return or forfeit |

All flows execute against the **Base Sepolia testnet** using real on-chain settlements.

## Running Locally

```bash
npm install
npm run dev
```

Open http://localhost:5173 — two test wallets are auto-generated and funded from the testnet faucet on first load.

## Controls

- **Run** — execute all steps in sequence with animated transitions
- **Step** — advance one step at a time, inspect JSON at each point
- **Reset** — clear state and re-fund wallets from faucet

## How It Works

1. Two wallets (Agent + Provider) are generated using ethers.js and stored in localStorage
2. Both wallets are registered with the remit.md server via EIP-712 signed requests
3. Both are funded with testnet USDC via the faucet
4. Each flow makes real API calls and shows request/response JSON inline

## License

MIT
