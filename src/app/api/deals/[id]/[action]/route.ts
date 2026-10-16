import { NextRequest } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { AppError, ok, route } from "@/lib/errors";
import { checkout, getDeal, LIVE, markFunded, refund, release, submitProof } from "@/lib/engine";
import { audit } from "@/lib/audit";

const Proof = z.object({
  posts: z.array(z.object({ url: z.string().trim().url(), caption: z.string().max(5000).optional(), postedAt: z.string().nullable().optional() })).min(1).max(20),
});

export const POST = route(async (req: NextRequest, ctx: { params: Promise<{ id: string; action: string }> }) => {
  const { id, action } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  switch (action) {
    case "checkout":
      return ok(await checkout(id));
    case "simulate-funding": {
      if (LIVE()) throw new AppError("NOT_ALLOWED", "Simulation disabled in live mode", "pay_virtual_account", 403);
      const d = await getDeal(id);
      if (!d.onramp) await checkout(id);
      const fresh = await getDeal(id);
      return ok(await markFunded(id, Number(fresh.onramp?.expectedUsdcMicro ?? 1e6), `mock-fund-${Date.now()}`, "mock"));
    }
    case "proof": {
      const p = Proof.safeParse(body);
      if (!p.success) throw new AppError("PROOF_INCOMPLETE", p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), "fix_request");
      return ok(await submitProof(id, p.data.posts));
    }
    case "release": {
      const d = await getDeal(id);
      return ok(await release(id, `brand:${d.brandId}`));
    }
    case "refund": {
      const d = await getDeal(id);
      return ok(await refund(id, `brand:${d.brandId}`));
    }
    case "review": {
      const r = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().max(500).optional() }).safeParse(body);
      if (!r.success) throw new AppError("VALIDATION", "rating 1-5 required", "fix_request");
      const d = await getDeal(id);
      if (!["released", "settled"].includes(d.status)) throw new AppError("INVALID_STATE", "Review only after release", "wait_for_release", 409);
      await db.insert(schema.reviews).values({ dealId: id, ...r.data }).onConflictDoUpdate({ target: schema.reviews.dealId, set: r.data });
      await audit(id, "review_left", `brand:${d.brandId}`, r.data);
      return ok({ reviewed: true });
    }
    default:
      throw new AppError("UNKNOWN_ACTION", `Unknown action ${action}`, "check_api_docs", 404);
  }
});
