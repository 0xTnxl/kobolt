// Public payment gateway for payers. Payer verifies their own email with Paj (Paj sends the OTP).
import { NextRequest } from "next/server";
import { z } from "zod";
import { AppError, ok, route } from "@/lib/errors";
import { checkout, getDeal, kvGet, kvSet, LIVE, markFunded, sync } from "@/lib/engine";
import { paj } from "@/lib/paj";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function publicView(id: string) {
  const d = await sync(id);
  const [b] = await db.select({ name: schema.brands.name }).from(schema.brands).where(eq(schema.brands.id, d.brandId));
  const [c] = await db.select({ name: schema.creators.name, handle: schema.creators.handle }).from(schema.creators).where(eq(schema.creators.id, d.creatorId));
  return { id: d.id, title: d.title, amountNgn: d.amountNgn, status: d.status, brand: b?.name, creator: c, mode: LIVE() ? "live" : "mock", onramp: d.onramp, fundingTx: d.fundingTx, heldUsdc: d.heldUsdcMicro / 1e6 };
}

export const GET = route(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => ok(await publicView((await ctx.params).id)));

export const POST = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const deal = await getDeal(id);
  if (deal.status !== "awaiting_funding") throw new AppError("ALREADY_FUNDED", `Deal is ${deal.status}`, "refresh", 409);

  switch (body?.step) {
    case "usdc": // foreign payer: no Paj needed, send USDC straight to the deal account
      await checkout(id);
      return ok(await publicView(id));
    case "initiate": {
      const p = z.object({ email: z.string().email() }).safeParse(body);
      if (!p.success) throw new AppError("VALIDATION", "Valid email required", "fix_request");
      if (!LIVE()) {
        await kvSet(`payer:${id}`, p.data.email);
        return ok({ otpSent: true, mock: true });
      }
      await paj.initiateSession(p.data.email);
      await kvSet(`payer:${id}`, p.data.email);
      return ok({ otpSent: true });
    }
    case "verify": {
      const p = z.object({ otp: z.string().min(4).max(10) }).safeParse(body);
      if (!p.success) throw new AppError("VALIDATION", "OTP required", "fix_request");
      const email = await kvGet(`payer:${id}`);
      if (!email) throw new AppError("PAYER_EMAIL_MISSING", "Enter your email first", "initiate");
      if (!LIVE()) {
        await checkout(id, "mock", email);
        return ok(await publicView(id));
      }
      const s = await paj.verifySession(email, p.data.otp);
      await checkout(id, s.token, email); // token used once, never stored
      return ok(await publicView(id));
    }
    case "simulate": {
      if (LIVE()) throw new AppError("NOT_ALLOWED", "Simulation disabled in live mode", "pay_virtual_account", 403);
      const d = await getDeal(id);
      const on = d.onramp as { expectedUsdcMicro?: number } | null;
      await markFunded(id, on?.expectedUsdcMicro ?? 1e6, `mock-fund-${Date.now()}`, "mock");
      return ok(await publicView(id));
    }
    default:
      throw new AppError("UNKNOWN_STEP", "step must be usdc|initiate|verify", "fix_request");
  }
});
