// Kobolt escrow engine.
// Money truth = the deal's on-chain USDC account. Workflow truth = the deals row.
// Every transition is an atomic compare-and-set, so retries never pay twice.
import { and, eq, inArray, ne, isNotNull, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Deal } from "./types";
import { AppError } from "./errors";
import { audit } from "./audit";
import { paj } from "./paj";
import { approveAgent, dealBalanceMicro, dealWallet, latestDealSignature, prepareDealAccount, transferFromDeal } from "./solana";
import { verifyCase, POLICY_VERSION, VERIFIER_ID } from "./verifier";
import { canonicalUrl, memoPayload, type Brief as VBrief } from "./verifier-schema";
import { fetchProof, type ProofInput } from "./fetcher";
import type { Verdict } from "@/db/schema";

export const LIVE = () => (process.env.PAYMENT_MODE || "mock") === "live";
const MOCK_RATE = 1600;
const webhookUrl = () => (process.env.PUBLIC_URL ? `${process.env.PUBLIC_URL.replace(/\/$/, "")}/api/webhooks/paj` : undefined);

// ---------- kv / Paj session ----------
export async function kvGet(key: string) {
  const [r] = await db.select().from(schema.kv).where(eq(schema.kv.key, key));
  return r?.value ?? null;
}
export async function kvSet(key: string, value: string) {
  await db.insert(schema.kv).values({ key, value }).onConflictDoUpdate({ target: schema.kv.key, set: { value, updatedAt: new Date() } });
}
export async function pajToken() {
  const t = await kvGet("paj_token");
  if (!t) throw new AppError("PAJ_SESSION_MISSING", "No Paj session. Log in on /ops.", "reauthenticate_paj_session", 409);
  return t;
}

// ---------- helpers ----------
export async function getDeal(id: string): Promise<Deal> {
  const [d] = await db.select().from(schema.deals).where(eq(schema.deals.id, id));
  if (!d) throw new AppError("DEAL_NOT_FOUND", `Deal ${id} not found`, "check_deal_id", 404);
  return d;
}

async function claim(id: string, from: string[], to: string, patch: Partial<typeof schema.deals.$inferInsert> = {}) {
  const rows = await db.update(schema.deals).set({ ...patch, status: to, updatedAt: new Date() })
    .where(and(eq(schema.deals.id, id), inArray(schema.deals.status, from))).returning();
  return rows[0] ?? null;
}
async function patch(id: string, p: Partial<typeof schema.deals.$inferInsert>) {
  await db.update(schema.deals).set({ ...p, updatedAt: new Date() }).where(eq(schema.deals.id, id));
}
function errInfo(e: unknown) {
  return e instanceof AppError ? { code: e.code, message: e.message, next_action: e.nextAction } : { code: "INTERNAL", message: String(e), next_action: "retry" };
}
type Onramp = {
  mode: "mock" | "live"; dealWallet: string; tokenAccount?: string; expectedUsdcMicro: number; rate: number;
  paj: { id: string; accountNumber: string; accountName: string; bank: string; fiatAmount: number; amount: number } | null;
  pajError?: unknown; delegated?: boolean; approveTx?: string;
};
const onrampOf = (d: Deal) => d.onramp as unknown as Onramp | null;

// ---------- funding: two paths into the same deal account ----------
/** payerToken: the payer's own Paj session (from the /pay gateway). Falls back to operator session. */
export async function checkout(id: string, payerToken?: string, payerEmail?: string) {
  const deal = await getDeal(id);
  if (deal.status !== "awaiting_funding") throw new AppError("INVALID_STATE", `Deal is ${deal.status}`, "refresh_deal", 409);
  const existing = onrampOf(deal);
  if (existing && (existing.paj || !payerToken)) return existing; // idempotent; allow upgrade from USDC-only to Paj

  let onramp: Onramp;
  if (!LIVE()) {
    const expected = Math.round((deal.amountNgn / MOCK_RATE) * 1e6);
    onramp = {
      mode: "mock", dealWallet: `MOCK-${id}`, expectedUsdcMicro: expected, rate: MOCK_RATE,
      paj: { id: `mock-on-${id}`, accountNumber: "0123456789", accountName: "KOBOLT ESCROW (MOCK)", bank: "Mock Bank", fiatAmount: deal.amountNgn, amount: expected / 1e6 },
    };
  } else {
    const acct = await prepareDealAccount(id);
    try {
      const o = await paj.createOnramp(payerToken ?? (await pajToken()), deal.amountNgn, acct.wallet, webhookUrl());
      if (payerEmail) await audit(id, "payer_verified", "system", { payer: payerEmail.replace(/(.).+(@.*)/, "$1***$2") });
      onramp = { mode: "live", dealWallet: acct.wallet, tokenAccount: acct.tokenAccount, expectedUsdcMicro: Math.round(o.amount * 1e6), rate: o.rate, paj: o };
    } catch (e) {
      // Naira rail down? Deal is still fundable with USDC directly.
      const rate = (await paj.rates().catch(() => null))?.onRampRate.rate ?? MOCK_RATE;
      onramp = { mode: "live", dealWallet: acct.wallet, tokenAccount: acct.tokenAccount, expectedUsdcMicro: Math.round((deal.amountNgn / rate) * 1e6), rate, paj: null, pajError: errInfo(e) };
    }
  }
  await patch(id, { onramp: onramp as unknown as Record<string, unknown> });
  await audit(id, "checkout_created", "system", { dealWallet: onramp.dealWallet, expectedUsdc: onramp.expectedUsdcMicro / 1e6, pajOrderId: onramp.paj?.id ?? null, rate: onramp.rate });
  return onramp;
}

async function grantAgent(id: string) {
  const d = await getDeal(id);
  const on = onrampOf(d);
  if (!on || on.delegated || !LIVE() || !d.heldUsdcMicro) return;
  try {
    const tx = await approveAgent(id, d.heldUsdcMicro);
    await patch(id, { onramp: { ...on, delegated: true, approveTx: tx } as unknown as Record<string, unknown> });
    await audit(id, "agent_allowance_granted", "system", { delegate: VERIFIER_ID, allowanceUsdc: d.heldUsdcMicro / 1e6, tx });
  } catch (e) {
    await audit(id, "agent_allowance_failed", "system", errInfo(e));
  }
}

export async function markFunded(id: string, micro: number, tx: string | null, source: string) {
  const d = await claim(id, ["awaiting_funding"], "held", { heldUsdcMicro: micro, fundingTx: tx });
  if (d) {
    await audit(id, "funded_and_held", "system", { usdc: micro / 1e6, tx, source });
    await grantAgent(id);
  }
  return d;
}

// ---------- proof + agent ----------
export function toVerifierBrief(d: Deal): VBrief {
  return {
    dealId: d.id, policyVersion: POLICY_VERSION, amountUsd: Math.max(d.heldUsdcMicro, 1) / 1e6,
    platform: d.brief.platform, requiredFormat: d.brief.format, requiredPostCount: d.brief.count,
    requiredHashtags: d.brief.hashtags, acceptedDisclosures: d.brief.disclosures.length ? d.brief.disclosures : ["#ad"],
    disclosureMaxOffset: 125, createdAt: d.createdAt.toISOString(), deadline: d.brief.deadline,
    brandNames: d.brief.brandNames, competitorBlocklist: d.brief.competitors, bannedClaims: d.brief.bannedClaims, notes: d.brief.notes,
    mandate: { maxAutoReleaseUsd: d.mandate.maxAutoReleaseUsdc, minConfidence: d.mandate.minConfidence, requireFetchedProof: d.mandate.requireFetchedProof },
  };
}

async function reusedUrls(excludeId: string) {
  const rows = await db.select({ proof: schema.deals.proof }).from(schema.deals).where(and(ne(schema.deals.id, excludeId), isNotNull(schema.deals.proof)));
  return new Set(rows.flatMap((r) => r.proof?.items?.map((i) => canonicalUrl(i.url)) ?? []));
}

export async function submitProof(id: string, inputs: ProofInput[]) {
  const deal = await getDeal(id);
  const prev = deal.status;
  const d = await claim(id, ["held", "held_review"], "verifying");
  if (!d) throw new AppError("INVALID_STATE", `Cannot submit proof while deal is ${prev}`, prev === "awaiting_funding" ? "wait_for_funding" : "refresh_deal", 409);
  try {
    const items = await fetchProof(inputs);
    await patch(id, { proof: { items, submittedAt: new Date().toISOString() } });
    await audit(id, "proof_submitted", `creator:${deal.creatorId}`, { posts: items.map((i) => ({ url: i.url, evidence: i.evidence, source: i.fetchSource })) });
    return await runAgent(id);
  } catch (e) {
    await claim(id, ["verifying"], prev);
    throw e;
  }
}

async function runAgent(id: string) {
  const deal = await getDeal(id);
  if (deal.status !== "verifying" || !deal.proof) throw new AppError("INVALID_STATE", `Deal is ${deal.status}`, "refresh_deal", 409);
  const r = await verifyCase(toVerifierBrief(deal), deal.proof.items, await reusedUrls(id));
  const verdict: Verdict = { ...r.decision, rules: r.rules, model: r.model, samples: r.samples, latencyMs: r.latencyMs };
  const hash = await audit(id, "agent_verdict", VERIFIER_ID, { verdict: verdict.verdict, confidence: verdict.confidence, autoRelease: verdict.autoRelease, evidenceHash: verdict.evidenceHash, model: verdict.model, reasons: verdict.reasons });

  if (verdict.autoRelease) {
    await claim(id, ["verifying"], "approved", { verdict });
    await audit(id, "release_approved", VERIFIER_ID, { policy: POLICY_VERSION, verdictEventHash: hash });
    return release(id, VERIFIER_ID);
  }
  await claim(id, ["verifying"], "held_review", { verdict });
  return getDeal(id);
}

// ---------- payout (release / refund) ----------
type Target = { bankId: string; accountNumber: string };

async function payout(id: string, from: string[], inflight: string, done: string, target: Target, actor: string, kind: "release" | "refund") {
  const before = await getDeal(id);
  const d = await claim(id, from, inflight);
  if (!d) {
    if ([inflight, done, "settled", "refunded"].includes(before.status)) return before; // replay-safe
    throw new AppError("INVALID_STATE", `Cannot ${kind} while deal is ${before.status}`, "refresh_deal", 409);
  }
  const back = before.status;
  const micro = d.heldUsdcMicro;
  const amountUsdc = micro / 1e6;
  await audit(id, `${kind}_started`, actor, { amountUsdc, to: target.accountNumber.replace(/\d(?=\d{4})/g, "*") });

  // Step 1: Paj offramp order (no money moved yet → safe to revert)
  let order: Record<string, unknown>;
  try {
    if (!LIVE()) {
      order = { id: `mock-off-${id}-${kind}`, mode: "mock", address: "MOCK", amount: amountUsdc, fiatAmount: Math.round(amountUsdc * 1550), rate: 1550 };
    } else {
      if (amountUsdc < 0.5) throw new AppError("AMOUNT_BELOW_MIN", "Paj minimum offramp is 0.5 USDC", "increase_amount");
      const bal = await dealBalanceMicro(id);
      if (bal.amount < micro) throw new AppError("ESCROW_INSUFFICIENT", `Deal account has ${bal.amount / 1e6} USDC, needs ${amountUsdc}`, "wait_for_funding", 409);
      const o = await paj.createOfframp(await pajToken(), amountUsdc, target.bankId, target.accountNumber, webhookUrl());
      if (!o.address?.trim()) throw new AppError("PAJ_NO_ADDRESS", "Paj order missing deposit address", "retry", 502);
      order = { ...o, mode: "live" };
    }
  } catch (e) {
    await patch(id, { status: back, lastError: errInfo(e) });
    await audit(id, `${kind}_failed_retryable`, "system", errInfo(e));
    throw e;
  }
  await patch(id, { payout: { ...order, kind } });

  // Step 2: on-chain transfer with verdict memo
  const byAgent = actor === VERIFIER_ID && kind === "release";
  const memo = memoPayload(
    { policyVersion: POLICY_VERSION, verdict: kind === "refund" ? "mismatch" : d.verdict?.verdict ?? "approve", evidenceHash: d.verdict?.evidenceHash ?? "0".repeat(64) },
    id, byAgent ? "agent" : actor.startsWith("brand") ? "brand" : "admin",
  );
  try {
    // Agent signs as SPL delegate when its allowance exists; otherwise the deal owner key signs.
    const signer = byAgent && onrampOf(d)?.delegated ? "agent" : "owner";
    const sig = LIVE() ? await transferFromDeal(id, String(order.address), micro, signer, memo) : `mock-tx-${Date.now()}`;
    await claim(id, [inflight], done, { payoutTx: sig, lastError: null });
    await audit(id, kind === "release" ? "released" : "refunded", actor, { pajOrderId: order.id, tx: sig, memo, fiatAmount: order.fiatAmount, rate: order.rate });
    if (!LIVE() && kind === "release") await claim(id, ["released"], "settled");
  } catch (e) {
    await patch(id, { status: "failed", lastError: errInfo(e) });
    await audit(id, `${kind}_transfer_unknown`, "system", { ...errInfo(e), next_action: "verify_onchain_then_resolve" });
    throw e;
  }
  return getDeal(id);
}

export async function release(id: string, actor: string) {
  const deal = await getDeal(id);
  const [c] = await db.select().from(schema.creators).where(eq(schema.creators.id, deal.creatorId));
  if (!c?.bankId || !c.accountNumber) throw new AppError("PAYOUT_ACCOUNT_MISSING", "Creator has no payout bank account", "add_creator_bank", 409);
  if (actor !== VERIFIER_ID) await audit(id, "release_approved", actor, { policy: "human override" });
  return payout(id, ["approved", "held_review"], "releasing", "released", { bankId: c.bankId, accountNumber: c.accountNumber }, actor, "release");
}

export async function refund(id: string, actor: string) {
  const deal = await getDeal(id);
  if (deal.status === "awaiting_funding") {
    const d = await claim(id, ["awaiting_funding"], "cancelled");
    if (d) await audit(id, "cancelled", actor, {});
    return getDeal(id);
  }
  const [b] = await db.select().from(schema.brands).where(eq(schema.brands.id, deal.brandId));
  if (!b?.bankId || !b.accountNumber) throw new AppError("REFUND_ACCOUNT_MISSING", "Brand has no refund bank account", "add_brand_bank", 409);
  return payout(id, ["held", "held_review"], "refunding", "refunded", { bankId: b.bankId, accountNumber: b.accountNumber }, actor, "refund");
}

// ---------- sync: chain is the source of truth for funding ----------
export async function sync(id: string) {
  const deal = await getDeal(id);
  if (!LIVE()) return deal;
  const on = onrampOf(deal);

  if (deal.status === "awaiting_funding" && on?.dealWallet && on.mode === "live") {
    const bal = await dealBalanceMicro(id).catch(() => null);
    if (bal && bal.amount > 0 && bal.amount >= on.expectedUsdcMicro * 0.98) {
      const sig = await latestDealSignature(id).catch(() => null);
      await markFunded(id, bal.amount, sig, on.paj ? "paj_onramp_or_direct_usdc" : "direct_usdc");
    }
  } else if (deal.status === "held" && on && !on.delegated) {
    await grantAgent(id);
  }

  if (deal.status === "released" && deal.payout?.mode === "live" && deal.payout.id) {
    const token = await kvGet("paj_token");
    const t = token ? await paj.transaction(token, String(deal.payout.id)).catch(() => null) : null;
    if (t?.status === "COMPLETED") {
      const d = await claim(id, ["released"], "settled");
      if (d) await audit(id, "settled", "system", { pajOrderId: deal.payout.id, ngn: t.fiatAmount });
    }
  }
  return getDeal(id);
}

export async function syncAll() {
  const open = await db.select({ id: schema.deals.id }).from(schema.deals).where(inArray(schema.deals.status, ["awaiting_funding", "held", "released"]));
  for (const d of open) await sync(d.id).catch((e) => console.error("sync", d.id, e));
}

export async function nextDealId() {
  const rows = await db.execute(dsql`select coalesce(max(substring(id from 4)::int), 3500) + 1 as n from deals where id ~ '^KB-[0-9]+$'`);
  return `KB-${Number((rows as unknown as { n: number }[])[0]?.n ?? 3501)}`;
}

export { dealWallet };
