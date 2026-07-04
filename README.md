# CipherPulse

Transparent protocol analytics with private aggregate snapshots.

CipherPulse gives Web3 protocols, DAOs, and on-chain communities a shared analytics dashboard for community health, governance sentiment, activity, cohort participation, risk pressure, and whale influence without exposing raw wallet-level private signals.

- Live app: https://cipherpulse-psi.vercel.app
- Interactive simulator: https://cipherpulse-psi.vercel.app/simulator
- Network target: Ethereum Sepolia
- Contract: `0x8C9244E7f745328476639152E0bbFd41d46797e9`

## Problem

Web3 protocols need analytics to understand their communities, but analytics can easily become surveillance.

Protocols want to know:

- whether community health is improving
- whether governance sentiment is positive or negative
- whether contributors and delegates are active
- whether whales are dominating participation
- whether risk or sybil pressure is rising
- whether confidential KPIs crossed warning thresholds

The sensitive part is that many of these signals can reveal private wallet behavior, voting preferences, risk scores, sentiment, balances, or strategy. Publishing raw wallet-level data harms users and discourages honest participation.

## Solution

CipherPulse is a public-facing transparency dashboard that separates analytics into two paths:

1. Public analytics stay public and cheap.
2. Sensitive analytics are encrypted, aggregated, and released only as aggregate snapshots.

Everyone sees the same dashboard:

- protocol teams
- DAO members
- token holders
- contributors
- delegates
- users
- partners

CipherPulse is not a private admin console. It is a shared community transparency layer.

## Product Experience

The dashboard shows:

- Community Health
- Governance Sentiment
- Activity Trend
- Active Wallets
- Transaction Count
- Proposal Count
- Public Participation
- Whale Influence
- Risk Pressure
- Confidential Alert Status
- Cohort Participation
- Risk Distribution

The simulator lets users tune the underlying aggregate signals and see the analytics update in real time. It also shows ciphertext handles to make the privacy model visible.

## Why FHE

Fully Homomorphic Encryption is useful when a protocol needs computation over sensitive values without revealing those values.

CipherPulse uses FHE for private aggregate signals such as:

- private governance sentiment
- private risk pressure
- whale influence scoring
- sybil/risk bucket aggregation
- confidential KPI threshold alerts
- private cohort confidence

CipherPulse does not use FHE for public metrics such as:

- transaction count
- proposal count
- active addresses
- public votes
- public volume
- public contract interactions

This keeps the product realistic. FHE is reserved for the parts of analytics that actually need privacy.

## Architecture

```text
Public analytics path
  Public on-chain data
    -> RPC / indexer / analytics API
    -> frequently updated dashboard metrics

Private analytics path
  Sensitive community signals
    -> browser-side or relayer encryption
    -> encrypted smart contract submission
    -> encrypted aggregate counters
    -> authorized daily / weekly reveal
    -> cached aggregate snapshot
    -> shared dashboard for all users
```

## Snapshot Model

CipherPulse is designed around daily or weekly private snapshots.

Instead of decrypting on every page view:

- private signals are batched
- encrypted counters are updated
- authorized reveal happens on a schedule
- one aggregate snapshot is cached
- all users read the same snapshot

This makes the cost model much more practical than per-user or per-click FHE.

## Tech Stack

### Frontend

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- ethers v6
- pure CSS chart components
- Vercel deployment

The frontend intentionally avoids heavy infrastructure:

- no database
- no backend API server
- no Prisma
- no Supabase
- no Docker
- no RainbowKit
- no heavy charting library

### Smart Contracts

- Solidity
- Hardhat
- Fhenix / CoFHE-compatible contract primitives
- Ethereum Sepolia deployment target

Main contract:

```text
contracts/CipherPulseAnalytics.sol
```

### Contract Tooling

Contract tooling is isolated from the frontend in:

```text
contracts-package/
```

This keeps the Vercel frontend build lightweight while preserving the full smart contract implementation and deployment scripts.

## Fhenix / CoFHE Usage

The contract uses encrypted input and state types:

- `InEuint32`
- `InEuint8`
- `InEbool`
- `euint32`
- `euint8`
- `ebool`

The contract uses FHE operations:

- `FHE.add` for encrypted counters
- `FHE.gte` for encrypted threshold checks
- `FHE.select` for encrypted conditional aggregation
- `FHE.allowThis` for contract permissions
- `FHE.allowSender` for sender permissions

The contract supports:

- encrypted signal submission
- encrypted activity aggregation
- encrypted governance sentiment aggregation
- encrypted cohort metrics
- encrypted risk buckets
- confidential KPI threshold checks
- authorized aggregate reveal
- encrypted handle reads

Events emit metadata and ciphertext handles only. They do not emit raw private values.

## Frontend FHE Adapter

The frontend Fhenix adapter lives in:

```text
lib/fhenixClient.ts
```

It handles:

- wallet connection
- Ethereum Sepolia network switching
- dynamic CoFHE SDK loading
- encrypted signal submission
- contract reads
- authorized reveal requests
- live runtime status

The adapter is loaded safely so the app can build and deploy on Vercel without server-side wallet or browser API crashes.

## Simulator

The simulator is available at:

```text
/simulator
```

It lets users control:

- encrypted signal count
- active wallets
- transaction count
- proposal count
- support / against / abstain signals
- low / medium / high risk buckets
- Contributors / Delegates / Whales / New Users
- whale influence weight
- aggregate activity volume
- confidential KPI alerts

The simulator updates analytics in real time and writes a shared aggregate snapshot to browser storage. The main dashboard reads that same snapshot, so changes made in the simulator are reflected in the product dashboard.

The simulator demonstrates the privacy flow:

```text
Private input
  -> browser encryption / ciphertext handle
  -> aggregate counter update
  -> dashboard chart update
  -> no raw signal table
```

## Privacy Guarantees

CipherPulse does not show:

- wallet-level rows
- individual votes
- raw risk scores
- raw private sentiment
- raw private cohort records
- raw seed tables

CipherPulse shows:

- aggregate metrics
- aggregate buckets
- cohort-level totals
- ciphertext handles
- public analytics
- private snapshot outputs

The goal is transparency without surveillance.

## Cost Model

A naive FHE analytics system would be expensive because every user action, dashboard refresh, or page view could trigger encrypted computation or reveal.

CipherPulse uses a lower-cost model:

- public metrics use normal reads
- sensitive signals are batched
- encrypted state stores counters only
- reveal happens daily or weekly
- all users read the same cached snapshot
- cost scales with batch count and reveal frequency

Cost formula:

```text
privateSignalsPerWeek =
  users * privateSignalsPerUserPerWeek

batchedTxPerWeek =
  ceil(privateSignalsPerWeek / batchSize)

submitCost =
  batchedTxPerWeek * avgSubmitGas * gasPrice * tokenPrice

revealCost =
  snapshotFrequencyPerWeek * avgRevealGas * gasPrice * tokenPrice

totalCost =
  submitCost + revealCost + optionalCoFHETaskCost

costPerUser =
  totalCost / users
```

Actual cost depends on:

- chain
- gas price
- batch size
- snapshot frequency
- measured contract gas
- Fhenix / CoFHE task pricing
- relayer strategy

## Repository Structure

```text
app/                     Next.js app routes
app/simulator/           Interactive analytics simulator
lib/                     Types, Fhenix adapter, simulator state
contracts/               CipherPulseAnalytics.sol
contracts-package/       Hardhat + Fhenix contract tooling
public/                  Static assets
README.md                Project documentation
```

## Environment Variables

Frontend live mode uses public environment variables:

```text
NEXT_PUBLIC_CONTRACT_ADDRESS
NEXT_PUBLIC_RPC_URL
NEXT_PUBLIC_CHAIN_ID
```

Private deployment keys must never be committed and must never be exposed through `NEXT_PUBLIC_*` variables.

## Local Development

```bash
npm install
npm run dev
```

Frontend build:

```bash
npm run build
```

Contract tooling is separate:

```bash
npm --prefix contracts-package run compile
npm --prefix contracts-package run test
```

## Deployment

Frontend:

```bash
vercel --prod --yes
```

The production frontend is currently deployed at:

```text
https://cipherpulse-psi.vercel.app
```

## Hackathon Fit

CipherPulse fits the FHE analytics track because it demonstrates:

- encrypted submissions
- encrypted aggregate state
- FHE-style thresholding and bucketing
- authorized aggregate reveal
- no raw private data leakage
- public dashboard deployment
- smart contract source and tooling
- practical cost-aware FHE minimization

## Pitch Summary

CipherPulse is a transparent protocol analytics layer for Web3 communities.

It lets every user see community health, governance sentiment, activity, risk pressure, and whale influence while keeping sensitive signals encrypted and aggregate-only.

Public metrics stay cheap. Private metrics use Fhenix-compatible encrypted compute. The result is useful analytics without wallet-level surveillance.
