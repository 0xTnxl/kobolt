// Eval harness: same hand-written test set, several systems, money-focused metrics.
import { z } from "zod";
import { Brief, ProofItem, canonicalUrl, type Verdict } from "./verifier-schema";
import { verifyCase } from "./verifier";

export const EvalFile = z.object({
  briefs: z.record(Brief),
  cases: z.array(
    z.object({
      id: z.string(),
      brief_id: z.string(),
      proof: z.array(ProofItem),
      expected: z.enum(["approve", "mismatch", "escalate"]),
      layer: z.string().optional(),
      tags: z.array(z.string()).default([]),
      ambiguous: z.boolean().default(false),
      reusedUrls: z.array(z.string()).default([]),
    }),
  ),
});
export type EvalFile = z.infer<typeof EvalFile>;

type Row = { id: string; expected: Verdict; got: Verdict; autoRelease: boolean; confidence: number; tags: string[]; layer?: string; ambiguous: boolean; latencyMs: number; quoteRate: number | null; reasons: string[] };

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);

function metrics(rows: Row[]) {
  const shouldHold = rows.filter((r) => r.expected !== "approve");
  const shouldApprove = rows.filter((r) => r.expected === "approve");
  const inj = rows.filter((r) => r.tags.includes("injection") || r.id.startsWith("D"));
  const hiConf = rows.filter((r) => r.confidence >= 0.8);
  const q = rows.map((r) => r.quoteRate).filter((x): x is number => x != null);
  return {
    n: rows.length,
    accuracy: pct(rows.filter((r) => r.got === r.expected).length, rows.length),
    wrongfulReleaseRate: pct(shouldHold.filter((r) => r.autoRelease).length, shouldHold.length),
    autoReleaseRate: pct(shouldApprove.filter((r) => r.autoRelease).length, shouldApprove.length),
    falseEscalationRate: pct(shouldApprove.filter((r) => !r.autoRelease).length, shouldApprove.length),
    injectionSuccessRate: pct(inj.filter((r) => r.autoRelease).length, inj.length),
    calibrationAt80: pct(hiConf.filter((r) => r.got === r.expected).length, hiConf.length),
    quoteValidity: q.length ? Math.round((q.reduce((a, b) => a + b, 0) / q.length) * 1000) / 10 : null,
    avgLatencyMs: rows.length ? Math.round(rows.reduce((a, r) => a + r.latencyMs, 0) / rows.length) : 0,
  };
}

export async function runEval(file: EvalFile, systems: (string | null)[]) {
  const out = [];
  for (const sys of systems) {
    const rows: Row[] = [];
    // Small concurrency to stay under provider rate limits
    for (let i = 0; i < file.cases.length; i += 4) {
      const batch = file.cases.slice(i, i + 4);
      rows.push(
        ...(await Promise.all(
          batch.map(async (c) => {
            const brief = file.briefs[c.brief_id];
            if (!brief) throw new Error(`case ${c.id}: unknown brief_id ${c.brief_id}`);
            const r = await verifyCase(brief, c.proof, new Set(c.reusedUrls.map(canonicalUrl)), sys);
            return {
              id: c.id, expected: c.expected, got: r.decision.verdict, autoRelease: r.decision.autoRelease, confidence: r.decision.confidence,
              tags: c.tags, layer: c.layer, ambiguous: c.ambiguous, latencyMs: r.latencyMs, quoteRate: r.validQuoteRate,
              reasons: r.decision.reasons.map((x) => `${x.layer}:${x.id}`),
            };
          }),
        )),
      );
    }
    const slices: Record<string, ReturnType<typeof metrics>> = {};
    for (const layer of new Set(rows.map((r) => r.layer ?? "none"))) slices[`layer:${layer}`] = metrics(rows.filter((r) => (r.layer ?? "none") === layer));
    slices["ambiguous"] = metrics(rows.filter((r) => r.ambiguous));
    out.push({ system: sys === null ? "rules-only" : `rules+${sys}`, overall: metrics(rows), slices, misses: rows.filter((r) => r.got !== r.expected) });
  }
  return out;
}
