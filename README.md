# CipherPulse

Confidential analytics for encrypted Web3 signals.

Live URL: https://cipherpulse-psi.vercel.app

CipherPulse helps protocols aggregate wallet, DAO, cohort, risk, and KPI signals without exposing raw user-level data. The production frontend is an end-user analytics app prepared for a live Ethereum Sepolia Fhenix/CoFHE contract.

## Current Status

- Frontend: deployed on Vercel
- Target network: Ethereum Sepolia
- Chain ID: `11155111`
- RPC: `https://ethereum-sepolia-rpc.publicnode.com`
- Explorer: `https://sepolia.etherscan.io`
- Deployer: `0xc6F268f7E74823B2e485fb6b45DC8F2D8E7192B1`
- Contract: `0x8C9244E7f745328476639152E0bbFd41d46797e9`
- Deployment tx: `0x93ead23f540265abded09e9892d8e69187a626f54386df76ad44fba50b6c7978`
- Test encrypted signal tx: `0x04c0b98c4dd44abf1e6688662937b402e06a683c7edf5a1b56a54f7f83ee1cac`
- Authorized reveal request tx: `0xb28e1ac9976ac51e6bfea125c2eb5c208306dc4a34372b444e2640c70debd23b`
- Explorer: `https://sepolia.etherscan.io/address/0x8C9244E7f745328476639152E0bbFd41d46797e9`
- Production simulation: not shown
- Contract tooling: separated in `contracts-package/`

The live app uses Ethereum Sepolia contract mode when these Vercel production env vars are configured:

- `NEXT_PUBLIC_CONTRACT_ADDRESS`
- `NEXT_PUBLIC_RPC_URL`
- `NEXT_PUBLIC_CHAIN_ID`

## Product Experience

The app is organized around one sticky top navigation:

- Overview
- Dashboard
- Submit
- Cohorts
- Alerts
- Security
- Protocol

There is no wallet-level raw data table. Dashboard values appear only from contract-backed aggregate reads or authorized reveal results.

## Live Mode

Live mode requires:

- deployed `CipherPulseAnalytics.sol`
- connected wallet on Ethereum Sepolia
- Vercel public env vars for contract address, RPC URL, and chain ID
- browser-side CoFHE adapter availability

If contract env vars are missing, transaction controls stay disabled and the dashboard remains empty.

## Fhenix / CoFHE Usage

Contract source:

```text
contracts/CipherPulseAnalytics.sol
```

The contract uses:

- encrypted input types: `InEuint8`, `InEuint32`, `InEbool`
- encrypted state types: `euint8`, `euint32`, `ebool`
- encrypted aggregation with `FHE.add`
- encrypted thresholding with `FHE.gte`
- encrypted conditional selection with `FHE.select`
- permissioning with `FHE.allowThis` and `FHE.allowSender`
- analyst-gated reveal handles

Events emit metadata and encrypted handles, not raw private values.

## Frontend Adapter

Frontend adapter:

```text
lib/fhenixClient.ts
```

It exposes:

- `getRuntimeStatus()`
- `getLiveModeStatus()`
- `connectWallet()`
- `encryptAndSubmitSignal()`
- `seedEncryptedSignals()`
- `refreshLiveAnalytics({ autoReveal: true })`
- `readLiveAggregates()`
- `requestAuthorizedReveal()`
- `readRevealedDashboardMetrics()`

The frontend dynamically loads the CoFHE browser SDK path at runtime. Hardhat and CoFHE contract tooling are not installed in the root frontend package.

The production frontend includes `@cofhe/sdk` so TFHE WebAssembly assets are served by the Vercel build instead of a third-party ESM CDN. This avoids the browser-side `Failed to initialize TFHE` WebAssembly fetch error.

## Live Analytics Diagnostics

The dashboard now reports why numbers are not visible:

- contract not configured
- contract connected, no submissions yet
- transaction pending or confirmed
- encrypted aggregate updated
- authorized wallet connected; reveal can be requested
- reveal transaction confirmed; waiting for CoFHE decrypt result
- aggregate revealed
- read failed with the underlying error
- wallet not authorized

Reveal buttons are exposed for aggregate, cohort, DAO pulse, and alert status. When the connected wallet is the owner or an analyst, the app now attempts authorized reveal automatically during refresh after connect and after submissions. Plaintext aggregate values appear only after the CoFHE decrypt/unseal path returns values; until then cards show encrypted handle readiness and the exact pending state instead of generated numbers.

## Live Analytics Seeding

The production UI includes a `Seed Live Analytics` panel for the protocol owner/analyst wallet:

- submits 30 real encrypted signal records to Ethereum Sepolia
- uses one wallet as the protocol relayer
- represents private analytics events, not unique wallet identities
- stores only transaction hashes/progress in the UI
- displays aggregate outputs only
- never renders raw individual seed rows
- never displays raw seed values

The same flow is available from the separated contract package when `PRIVATE_KEY` is provided as a process environment variable:

```bash
npm --prefix contracts-package run seed:sepolia
```

Do not place `PRIVATE_KEY` in frontend env vars and do not commit it.

## Reveal Behavior

Aggregates stay encrypted until authorized reveal/decrypt succeeds. The frontend now:

- checks whether the connected wallet is `owner` or `analysts(address)`
- requests reveal automatically when `refreshLiveAnalytics({ autoReveal: true })` is used
- attempts SDK `decryptForView` with the active/self permit path
- falls back to contract `getDecryptResultSafe` when CoFHE has published a decrypt result
- reports the precise blocker when plaintext is not yet available

If the connected wallet lacks the analyst role, the dashboard shows that the encrypted aggregate exists and asks for the owner/analyst wallet. If CoFHE decrypt publication or SDK unseal is still pending, the dashboard remains honest and does not show fake aggregate numbers.

## Contract Tooling

Contract tooling is isolated in:

```text
contracts-package/
```

Ethereum Sepolia deployment env vars:

```bash
PRIVATE_KEY=
ETHEREUM_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
```

Deployment command:

```bash
npm --prefix contracts-package run deploy:sepolia
```

Live seed command:

```bash
npm --prefix contracts-package run seed:sepolia
```

Never commit private keys.

## Troubleshooting

- Wrong network: switch wallet to Ethereum Sepolia, chain ID `11155111`.
- Contract address: verify `NEXT_PUBLIC_CONTRACT_ADDRESS` is `0x8C9244E7f745328476639152E0bbFd41d46797e9`.
- Empty analytics: submit or seed encrypted records, then refresh analytics.
- Reveal pending: connect the owner/analyst wallet and request/auto-request reveal.
- Plaintext numbers hidden: CoFHE decrypt/unseal is still pending or unavailable in the browser session.
- Public RPC log limits: the app falls back to encrypted handle reads when event log queries are blocked.
- Sepolia verification: inspect transactions at `https://sepolia.etherscan.io/address/0x8C9244E7f745328476639152E0bbFd41d46797e9`.

## Vercel Env Setup

After contract deployment:

```bash
vercel env add NEXT_PUBLIC_CONTRACT_ADDRESS production
vercel env add NEXT_PUBLIC_RPC_URL production
vercel env add NEXT_PUBLIC_CHAIN_ID production
vercel --prod --yes
```

Expected values:

```text
NEXT_PUBLIC_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
NEXT_PUBLIC_CHAIN_ID=11155111
```

## Privacy Model

- raw values are encrypted before submission
- individual submissions are not displayed
- dashboard shows aggregate insights only
- events do not expose private values
- authorized reveal model
- raw wallet-level table is not available

## Architecture

```text
Private Signal
  -> Browser Encryption
  -> Fhenix Contract
  -> Encrypted Aggregate
  -> Authorized Insight
  -> Dashboard
```

## Walkthrough Script

1. Open https://cipherpulse-psi.vercel.app.
2. Connect a wallet on Ethereum Sepolia.
3. Submit an encrypted wallet, DAO, risk, cohort, and KPI signal.
4. Show the real transaction hash and contract status.
5. Show that dashboard data is aggregate-only.
6. Show Security: no individual submissions or raw wallet table.
7. Show Protocol: contract address, network, adapter status, and CoFHE operations.

## Submission Links

- Live Vercel URL: https://cipherpulse-psi.vercel.app
- GitHub Repository: TBD
- Video: TBD
- Pitch Deck: TBD
