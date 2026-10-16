/**
 * Kobolt verifier: schemas, deterministic rules, and the decision function.
 *
 * Layers (the model can never override a failed rule):
 *   1. rules   -> deterministic checks in code (count, platform, deadline, hashtags, blocklist)
 *   2. model   -> fuzzy judgment only (genuine disclosure, brand fit, indirect competitors, banned claims)
 *   3. mandate -> brand's bounded authority (max amount, min confidence, fetched proof)
 *
 * Confidence is NOT self-reported. It is agreement across N sampled runs.
 */
import { createHash } from "node:crypto";
import { z } from "zod";

const Iso = z.string().datetime({ offset: true });
export const Platform = z.enum(["instagram", "tiktok", "youtube", "x"]);
export type Platform = z.infer<typeof Platform>;
export const Verdict = z.enum(["approve", "mismatch", "escalate"]);
export type Verdict = z.infer<typeof Verdict>;

export const Mandate = z.object({
  maxAutoReleaseUsd: z.number().positive(),
  minConfidence: z.number().min(0).max(1),
  requireFetchedProof: z.boolean(),
});

export const Brief = z.object({
  dealId: z.string(),
  policyVersion: z.string(),
  amountUsd: z.number().positive(),
  platform: Platform,
  requiredFormat: z.enum(["reel", "any"]).default("any"),
  requiredPostCount: z.number().int().positive(),
  requiredHashtags: z.array(z.string()),
  acceptedDisclosures: z.array(z.string()).default(["#ad"]),
  disclosureMaxOffset: z.number().int().default(125),
  createdAt: Iso,
  deadline: Iso,
  brandNames: z.array(z.string()),
  competitorBlocklist: z.array(z.string()),
  bannedClaims: z.array(z.string()),
  notes: z.string().optional(),
  mandate: Mandate,
});
export type Brief = z.infer<typeof Brief>;

export const ProofItem = z.object({
  url: z.string().url(),
  caption: z.string(),
  comments: z.array(z.string()).default([]),
  postedAt: Iso.nullable(),
  isLive: z.boolean().nullable(),
  evidence: z.enum(["fetched", "self_reported"]),
  fetchSource: z.string().nullable(),
});
export type ProofItem = z.infer<typeof ProofItem>;

// ───────────── Rule layer ─────────────
export const RuleId = z.enum([
  "POST_COUNT", "PLATFORM", "FORMAT", "DEADLINE", "NOT_PRE_EXISTING", "LINK_LIVE",
  "LINK_NOT_REUSED", "REQUIRED_HASHTAGS", "DISCLOSURE_TOKEN", "DISCLOSURE_POSITION", "COMPETITOR_BLOCKLIST",
]);
export type RuleId = z.infer<typeof RuleId>;
export const RuleResult = z.object({ id: RuleId, status: z.enum(["pass", "fail", "unknown"]), detail: z.string() });
export type RuleResult = z.infer<typeof RuleResult>;

const ZERO_WIDTH = "\\u200B-\\u200D\\u2060\\uFEFF";

/** Hashtag tokens exactly as typed. Zero-width chars stay INSIDE the token, so "#a<ZWSP>d" never equals "#ad". */
export function hashtags(text: string): { tag: string; index: number }[] {
  const re = new RegExp(`#([\\p{L}\\p{N}_${ZERO_WIDTH}]+)`, "gu");
  return [...text.matchAll(re)].map((m) => ({ tag: ("#" + m[1]).toLowerCase(), index: m.index ?? 0 }));
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-term match, so "glad" never matches "ad" and "Lumi" never matches "Lumiere". */
export function containsTerm(text: string, term: string): boolean {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(term)}($|[^\\p{L}\\p{N}])`, "iu").test(text);
}

export function platformOf(url: string): Platform | null {
  let h: string;
  try {
    h = new URL(url).hostname.toLowerCase().replace(/^(www|m)\./, "");
  } catch {
    return null;
  }
  if (h === "instagram.com") return "instagram";
  if (h === "tiktok.com" || h.endsWith(".tiktok.com")) return "tiktok";
  if (h === "youtube.com" || h === "youtu.be") return "youtube";
  if (h === "x.com" || h === "twitter.com") return "x";
  return null;
}

/** Host lowercased, path case preserved, query and trailing slash dropped. */
export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.toLowerCase().replace(/^(www|m)\./, "")}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return url.trim();
  }
}

export function runRules(brief: Brief, proof: ProofItem[], ctx: { reusedUrls: Set<string> }): RuleResult[] {
  const out: RuleResult[] = [];
  const add = (id: RuleId, ok: boolean | null, detail: string) => out.push({ id, status: ok === null ? "unknown" : ok ? "pass" : "fail", detail });

  const posts = [...new Map(proof.map((p): [string, ProofItem] => [canonicalUrl(p.url), p])).values()];
  add("POST_COUNT", posts.length >= brief.requiredPostCount, `${posts.length} distinct post(s), need ${brief.requiredPostCount}`);

  const wrongPlatform = posts.filter((p) => platformOf(p.url) !== brief.platform);
  add("PLATFORM", wrongPlatform.length === 0, wrongPlatform.length ? `wrong platform: ${wrongPlatform.map((p) => p.url).join(", ")}` : "all posts on required platform");

  if (brief.platform === "instagram" && brief.requiredFormat === "reel") {
    const notReels = posts.filter((p) => { try { return !/^\/reels?\//.test(new URL(p.url).pathname); } catch { return true; } });
    add("FORMAT", notReels.length === 0, notReels.length ? `not reels: ${notReels.map((p) => p.url).join(", ")}` : "all posts are reels");
  }

  const times = posts.map((p) => (p.postedAt ? Date.parse(p.postedAt) : null));
  if (!posts.length || times.some((t) => t === null || Number.isNaN(t))) {
    add("DEADLINE", null, "no real timestamp for at least one post");
    add("NOT_PRE_EXISTING", null, "no real timestamp for at least one post");
  } else {
    const late = times.filter((t) => (t as number) > Date.parse(brief.deadline)).length;
    add("DEADLINE", late === 0, late ? `${late} post(s) after deadline` : "all posts on time");
    const early = times.filter((t) => (t as number) < Date.parse(brief.createdAt)).length;
    add("NOT_PRE_EXISTING", early === 0, early ? `${early} post(s) published before the deal existed` : "all posts newer than the deal");
  }

  const liveVals = posts.map((p) => p.isLive);
  add("LINK_LIVE", liveVals.includes(false) ? false : liveVals.includes(null) ? null : true, liveVals.includes(false) ? "a post is deleted or private" : liveVals.includes(null) ? "liveness not checked (self-reported)" : "all posts live");

  const reused = posts.filter((p) => ctx.reusedUrls.has(canonicalUrl(p.url)));
  add("LINK_NOT_REUSED", reused.length === 0, reused.length ? `already used in another deal: ${reused.map((p) => p.url).join(", ")}` : "no cross-deal reuse");

  const missingTags = posts.flatMap((p) => {
    const have = new Set(hashtags(p.caption).map((h) => h.tag));
    return brief.requiredHashtags.filter((t) => !have.has(t.toLowerCase())).map((t) => `${t} missing on ${p.url}`);
  });
  add("REQUIRED_HASHTAGS", missingTags.length === 0, missingTags.join("; ") || "all required hashtags present");

  const accepted = new Set(brief.acceptedDisclosures.map((d) => d.toLowerCase()));
  const noDisclosure: string[] = [];
  const buried: string[] = [];
  for (const p of posts) {
    const hit = hashtags(p.caption).find((h) => accepted.has(h.tag));
    if (!hit) noDisclosure.push(p.url);
    else if (hit.index > brief.disclosureMaxOffset) buried.push(p.url);
  }
  add("DISCLOSURE_TOKEN", noDisclosure.length === 0, noDisclosure.length ? `no accepted disclosure (${brief.acceptedDisclosures.join(", ")}) in caption` : "disclosure token present");
  add("DISCLOSURE_POSITION", buried.length === 0, buried.length ? `disclosure beyond first ${brief.disclosureMaxOffset} chars` : "disclosure visible early");

  const hits = posts.flatMap((p) => brief.competitorBlocklist.filter((c) => containsTerm(p.caption, c)).map((c) => `"${c}" named`));
  add("COMPETITOR_BLOCKLIST", hits.length === 0, hits.join("; ") || "no blocklisted competitor named");
  return out;
}

// ───────────── Model layer ─────────────
export const CriterionId = z.enum(["DISCLOSURE_GENUINE", "BRAND_ON_TOPIC", "NO_COMPETITOR_REFERENCE", "NO_BANNED_CLAIMS"]);
export type CriterionId = z.infer<typeof CriterionId>;

export const Criterion = z
  .object({
    id: CriterionId,
    postIndex: z.number().int().min(0),
    status: z.enum(["pass", "fail", "unclear"]),
    quote: z.string().max(300).nullable().default(null),
    source: z.enum(["caption", "comment"]).nullable().default(null),
    rationale: z.string().transform((s) => s.slice(0, 240)).default(""),
  })
  .superRefine((c, ctx) => {
    const needsQuote = c.status === "fail" || (c.status === "pass" && c.id === "DISCLOSURE_GENUINE");
    if (needsQuote && (!c.quote || !c.source)) ctx.addIssue({ code: "custom", message: `${c.id}/${c.status} requires quote and source` });
  });

export const ModelOutput = z.object({
  criteria: z.array(Criterion).min(1),
  injectionDetected: z.boolean(),
  injectionQuote: z.string().nullable().default(null),
  verdict: Verdict,
});
export type ModelOutput = z.infer<typeof ModelOutput>;

export function effectiveVerdict(o: ModelOutput): Verdict {
  if (o.criteria.some((c) => c.status === "fail")) return "mismatch";
  if (o.criteria.some((c) => c.status === "unclear")) return "escalate";
  return "approve";
}

const norm = (s: string) => s.normalize("NFKC").replace(new RegExp(`[${ZERO_WIDTH}]`, "gu"), "").replace(/\s+/g, " ").trim().toLowerCase();

/** Every quoted span must literally appear in the proof. Catches hallucinated evidence. */
export function badQuotes(o: ModelOutput, proof: ProofItem[]): string[] {
  const bad: string[] = [];
  for (const c of o.criteria) {
    if (!c.quote) continue;
    const p = proof[c.postIndex];
    const hay = p ? norm(c.source === "comment" ? p.comments.join("\n") : p.caption) : "";
    if (!p || !hay.includes(norm(c.quote))) bad.push(`${c.id}@${c.postIndex}: "${c.quote}"`);
  }
  return bad;
}

// ───────────── Decision ─────────────
export interface Reason {
  layer: "rule" | "model" | "mandate";
  id: string;
  status: "pass" | "fail" | "unknown" | "unclear";
  detail: string;
  quote: string | null;
}

export interface Decision {
  verdict: Verdict;
  confidence: number;
  autoRelease: boolean;
  reasons: Reason[];
  policyVersion: string;
  evidenceHash: string;
}

export function evidenceHash(brief: Brief, verdict: Verdict, proof: ProofItem[]): string {
  const canon = JSON.stringify({
    dealId: brief.dealId,
    policyVersion: brief.policyVersion,
    verdict,
    proof: proof.map((p) => ({ url: canonicalUrl(p.url), caption: p.caption, postedAt: p.postedAt })),
  });
  return createHash("sha256").update(canon).digest("hex");
}

/** Memo payload for the release transaction (well under the 566-byte limit). */
export function memoPayload(d: Pick<Decision, "policyVersion" | "verdict" | "evidenceHash">, dealId: string, actor: "agent" | "brand" | "admin"): string {
  return `kobolt:v1|deal=${dealId}|by=${actor}|policy=${d.policyVersion}|verdict=${d.verdict}|h=${d.evidenceHash.slice(0, 32)}`;
}

function mandateGates(brief: Brief, proof: ProofItem[], confidence: number, reasons: Reason[]) {
  const m = brief.mandate;
  const gates: [string, boolean, string][] = [
    ["MANDATE_CONFIDENCE", confidence < m.minConfidence, `confidence ${confidence.toFixed(2)} below required ${m.minConfidence}`],
    ["MANDATE_AMOUNT", brief.amountUsd > m.maxAutoReleaseUsd, `$${brief.amountUsd.toFixed(2)} exceeds auto-release cap $${m.maxAutoReleaseUsd}`],
    ["MANDATE_EVIDENCE", m.requireFetchedProof && proof.some((p) => p.evidence !== "fetched"), "at least one post was self-reported, not fetched"],
  ];
  const tripped = gates.filter(([, bad]) => bad);
  for (const [id, , detail] of tripped) reasons.push({ layer: "mandate", id, status: "fail", detail, quote: null });
  return tripped.length === 0;
}

export function decide(a: { brief: Brief; proof: ProofItem[]; rules: RuleResult[]; samples: unknown[] | null }): Decision {
  const { brief, proof } = a;
  const reasons: Reason[] = [];
  const finish = (verdict: Verdict, confidence: number, autoRelease = false): Decision => ({
    verdict, confidence, autoRelease, reasons, policyVersion: brief.policyVersion, evidenceHash: evidenceHash(brief, verdict, proof),
  });

  for (const r of a.rules) if (r.status !== "pass") reasons.push({ layer: "rule", id: r.id, status: r.status, detail: r.detail, quote: null });

  // 1. A failed rule is final. The model cannot override it, so injected text cannot either.
  if (a.rules.some((r) => r.status === "fail")) return finish("mismatch", 1);

  // Rules-only baseline (samples === null): approve if every rule passes.
  if (a.samples === null) {
    if (a.rules.some((r) => r.status === "unknown")) return finish("escalate", 1);
    return mandateGates(brief, proof, 1, reasons) ? finish("approve", 1, true) : finish("escalate", 1);
  }

  if (!a.samples.length) {
    reasons.push({ layer: "model", id: "VERIFIER_UNAVAILABLE", status: "unknown", detail: "semantic model unavailable; a human must confirm", quote: null });
    return finish("escalate", 0);
  }

  // 2. Keep only well-formed, self-consistent samples whose quotes really exist in the proof.
  const valid: ModelOutput[] = [];
  for (const s of a.samples) {
    const p = ModelOutput.safeParse(s);
    if (!p.success) continue;
    if (p.data.verdict !== effectiveVerdict(p.data)) continue;
    if (badQuotes(p.data, proof).length) continue;
    valid.push(p.data);
  }
  if (!valid.length || valid.length < Math.ceil(a.samples.length * 0.6)) {
    reasons.push({ layer: "model", id: "MODEL_OUTPUT_INVALID", status: "unknown", detail: `${valid.length}/${a.samples.length} samples usable (unparseable, inconsistent, or quotes not found in proof)`, quote: null });
    return finish("escalate", 0);
  }

  // 3. Majority verdict; confidence = agreement across ALL samples (invalid ones count against it).
  const tally = new Map<Verdict, number>();
  for (const v of valid) tally.set(effectiveVerdict(v), (tally.get(effectiveVerdict(v)) ?? 0) + 1);
  const [top, topN] = [...tally.entries()].sort((x, y) => y[1] - x[1])[0];
  const confidence = topN / a.samples.length;

  // 4. Any sample flagging an injection sends it to a human.
  const inj = valid.find((v) => v.injectionDetected);
  if (inj) {
    reasons.push({ layer: "model", id: "INJECTION_SUSPECTED", status: "fail", detail: "proof text appears to instruct the reviewer", quote: inj.injectionQuote });
    return finish("escalate", confidence);
  }

  const rep = valid.find((v) => effectiveVerdict(v) === top)!;
  for (const c of rep.criteria) if (c.status !== "pass") reasons.push({ layer: "model", id: c.id, status: c.status, detail: c.rationale, quote: c.quote });
  if (top !== "approve") return finish(top, confidence);

  // 5. Missing data (e.g. no timestamp) can never auto-release.
  if (a.rules.some((r) => r.status === "unknown")) return finish("escalate", confidence);

  // 6. Mandate gate: bounded authority.
  if (!mandateGates(brief, proof, confidence, reasons)) return finish("escalate", confidence);
  return finish("approve", confidence, true);
}
