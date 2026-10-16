# Kobolt

**Verified escrow for brand–creator deals. An AI agent checks the work, then the money moves.**

Built for Build54 × Adaption.

## One-liner

Kobolt lets brands pay creators the moment the work is verified, instead of 48 hours and an argument later.

## Problem

- Brands pay creators upfront and hope the work arrives, or creators deliver first and hope they get paid.
- Checking deliverables by hand is slow and inconsistent: post count, hashtags, #ad disclosure, platform, deadline.
- Creator "portfolios" are self-reported. Nobody can prove a past deal really happened or was paid.
- Cross-border brands struggle to pay Nigerian creators quickly and cheaply.

## Solution

1. **Brand creates a deal**, e.g. "3 IG reels, #GlowSkinLaunch, #ad disclosure, $5", and the brief is stored.
2. **Brand funds it in naira** by bank transfer. Paj converts the naira to USDC and sends it to Kobolt's escrow wallet on Solana. The deal is now **HELD**.
3. **Creator submits proof**: links plus caption text.
4. **The verifier agent**, trained with Adaption, checks the proof against the brief and returns `approve | mismatch | escalate` with reasons and a confidence score.
5. **If approved and within the brand's mandate**, the agent releases the funds automatically. USDC goes to Paj, and Paj pays the creator **naira to their bank account**.
6. **If there's a mismatch or low confidence**, the funds stay held and the brand sees the agent's reasons and decides.
7. **Every release is recorded**: who approved it (agent, brand or admin), under which policy, the verdict and the transaction hash. That record builds the creator's **verified public portfolio**.

## Money flow

```
Brand NGN ──bank transfer──▶ Paj onramp ──USDC──▶ Kobolt escrow wallet (Solana)   [HELD]
                                                        │
                                       AI verifier + brand mandate
                                    ┌───────────────────┼───────────────────┐
                                 approve             mismatch            deadline missed
                                    │                   │                    │
                     USDC ──▶ Paj offramp ──NGN──▶   HELD_REVIEW         REFUNDED
                              creator's bank          (human decides)
```

No custom smart contracts. Kobolt's software is the escrow engine: the hold is a database state, and the chain carries plain USDC transfers. Every step has a Paj order ID and a Solana Explorer link.

## What makes it different

- **Verify-then-release.** Money moves only when the work matches the brief. A transfer on its own is a commodity; Kobolt's value is the check before it.
- **Adapted AI, not a generic chatbot.** The verifier is fine-tuned with Adaption on brief/proof/verdict examples, so it catches failures a base model misses: missing disclosure, wrong count, wrong platform, late post, competitor mentions.
- **Agent-ready by design** (ideas taken from the Amplify blueprint):
  - **Bounded authority:** the agent can only auto-release under the brand's mandate (max amount, minimum confidence, trusted creators).
  - **Signed approvals:** each release records the actor, the policy version and the verdict.
  - **Idempotent:** atomic state transitions mean a retry never pays twice.
  - **Machine-readable errors:** `{code, message, next_action}`.
  - **No limbo:** every failure ends in human review or a refund.
- **Reputation backed by real money.** Portfolio stats come only from verified, settled deals.
- **Stablecoins where they earn their place.** An AI agent can control a wallet but can't open a bank account, and USDC lets brands abroad fund deals without a Nigerian bank. Creators still get paid in naira.

## How we use Adaption

1. **Raw data:** 150–300 seed examples of brief, proof and verdict with reasons, covering clean matches and common failures.
2. **Adaptive Data:** expand and augment the seeds (tone, local creator language, edge cases) and review the quality signals.
3. **AutoScientist:** fine-tune a small model (under 10B) on the verdict task.
4. **Evidence:** base model vs. adapted model on a held-out set, with real numbers only.

Fallback while credits are pending: a base LLM with the same prompt and structured output, swapped for the adapted model when it's ready.

## Demo (3 minutes)

1. The brand creates a deal and the brief and contract are shown.
2. The brand funds it with naira through Paj, and USDC lands in escrow (explorer link).
3. **Happy path:** the creator submits proof, the agent approves within the mandate, and the creator receives naira (Paj order + transaction).
4. **Failure path:** a proof without #ad disclosure is held with the agent's reasons, and no money moves.
5. Base vs. adapted model on the same tricky case, plus eval numbers.
6. The creator's verified portfolio and the audit trail.

## Tech stack

- **App:** Next.js (App Router, API routes), TypeScript, Tailwind
- **DB:** SQLite (Drizzle), Postgres-compatible schema
- **Payments:** Paj Cash (NGN ⇄ USDC on/off-ramp), Solana mainnet USDC via `@solana/web3.js` + `@solana/spl-token`
- **AI:** Adaption (Adaptive Data + AutoScientist), with a base LLM as fallback
- **Payout rail interface:** Paj (live) and a mock rail as a demo safety net

## Scope

**In:** one brand, one creator, deal → fund → verify → release/hold/refund, audit trail, public portfolio.
**Out (roadmap):** wallet-connect funding, multi-currency (EURC/GBP), discovery search, disputes UI beyond approve/refund, production custody and licensing.

## Risks

| Risk | Mitigation |
|---|---|
| Onramp latency (real bank transfer) | Pre-fund one deal and use small live amounts on stage |
| Paj or RPC outage during the demo | Retries plus a mock payout rail behind one flag |
| Hot escrow key | Hackathon only; production uses a custody provider (e.g. DFNS) |
| Adaption credits late | Base-model fallback and an identical interface for the swap |
| Unsigned Paj webhooks | Treated as hints; state changes only after `GET /transactions/:id` confirms |

## Team

Two devs. One owns the backend (state machine, Paj, escrow, agent). The other owns data and the Adaption pipeline, then UI, demo and pitch.
