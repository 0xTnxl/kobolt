import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { AppError, ok, route } from "@/lib/errors";
import { kvGet, kvSet, pajToken } from "@/lib/engine";
import { paj } from "@/lib/paj";
import { verifyCase } from "@/lib/verifier";
import { Brief, ProofItem } from "@/lib/verifier-schema";
import { EvalFile, runEval } from "@/lib/eval";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const parse = <T,>(s: z.ZodType<T, z.ZodTypeDef, unknown>, b: unknown) => {
  const r = s.safeParse(b);
  if (!r.success) throw new AppError("VALIDATION", r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), "fix_request");
  return r.data;
};

export const GET = route(async (_req: NextRequest, ctx: { params: Promise<{ action: string }> }) => {
  const { action } = await ctx.params;
  if (action === "banks") return ok(await paj.banks(await pajToken()));
  if (action === "rates") return ok(await paj.rates());
  throw new AppError("UNKNOWN_ACTION", action, "check_api_docs", 404);
});

export const POST = route(async (req: NextRequest, ctx: { params: Promise<{ action: string }> }) => {
  const { action } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  switch (action) {
    case "paj-initiate": {
      const { email } = parse(z.object({ email: z.string().email() }), body);
      await paj.initiateSession(email);
      await kvSet("paj_email", email);
      return ok({ otpSent: true });
    }
    case "paj-verify": {
      const { otp } = parse(z.object({ otp: z.string().min(4) }), body);
      const email = await kvGet("paj_email");
      if (!email) throw new AppError("PAJ_EMAIL_MISSING", "Start login first", "paj_initiate");
      const s = await paj.verifySession(email, otp);
      await kvSet("paj_token", s.token);
      return ok({ connected: true, expiresAt: s.expiresAt });
    }
    case "bank-account": {
      const b = parse(z.object({ kind: z.enum(["creator", "brand"]), id: z.string(), bankId: z.string(), accountNumber: z.string().regex(/^\d{10}$/) }), body);
      const r = await paj.resolveBank(await pajToken(), b.bankId, b.accountNumber);
      const set = { bankId: b.bankId, bankName: r.bank?.name, accountNumber: b.accountNumber, accountName: r.accountName };
      if (b.kind === "creator") await db.update(schema.creators).set(set).where(eq(schema.creators.id, b.id));
      else await db.update(schema.brands).set(set).where(eq(schema.brands.id, b.id));
      return ok({ accountName: r.accountName, bankName: r.bank?.name });
    }
    case "compare": {
      // Same case through several systems. null/"rules" = rules-only baseline.
      const b = parse(z.object({ brief: Brief, proof: z.array(ProofItem).min(1), systems: z.array(z.string()).min(1).max(4) }), body);
      const results = await Promise.all(b.systems.map(async (s) => ({ system: s, ...(await verifyCase(b.brief, b.proof, new Set(), s === "rules" ? null : s)) })));
      return ok(results);
    }
    case "eval": {
      const b = parse(z.object({ file: EvalFile, systems: z.array(z.string()).min(1).max(4) }), body);
      return ok(await runEval(b.file, b.systems.map((s) => (s === "rules" ? null : s))));
    }
    case "seed": {
      await db.insert(schema.brands).values({ id: "br_glowskin", slug: "glowskin", name: "GlowSkin Naturals" }).onConflictDoNothing();
      await db.insert(schema.creators).values({ id: "cr_amaka", handle: "amaka_stories", name: "Amaka Stories", niche: "Beauty & Lifestyle", bio: "Lagos-based beauty creator. Honest reviews, glowing skin.", socialLink: "https://instagram.com/amaka_stories" }).onConflictDoNothing();
      return ok({ seeded: true });
    }
    default:
      throw new AppError("UNKNOWN_ACTION", action, "check_api_docs", 404);
  }
});
