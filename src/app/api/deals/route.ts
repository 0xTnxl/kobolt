import { NextRequest } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { AppError, ok, route } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { nextDealId } from "@/lib/engine";

const list = z.array(z.string().trim().min(1)).default([]);
const Body = z.object({
  brandId: z.string(),
  creatorId: z.string(),
  title: z.string().min(3),
  amountNgn: z.number().positive().max(5_000_000),
  brief: z.object({
    platform: z.enum(["instagram", "tiktok", "youtube", "x"]),
    format: z.enum(["reel", "any"]).default("any"),
    count: z.number().int().min(1).max(20),
    hashtags: list,
    brandNames: list,
    disclosures: list.transform((d) => (d.length ? d : ["#ad"])),
    competitors: list,
    bannedClaims: list,
    deadline: z.string().datetime({ offset: true }),
    notes: z.string().max(500).optional(),
  }),
  mandate: z
    .object({ maxAutoReleaseUsdc: z.number().positive(), minConfidence: z.number().min(0).max(1), requireFetchedProof: z.boolean().default(true) })
    .default({ maxAutoReleaseUsdc: 10, minConfidence: 0.8, requireFetchedProof: true }),
});

export const POST = route(async (req: NextRequest) => {
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) throw new AppError("VALIDATION", p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), "fix_request");
  const id = await nextDealId();
  const [deal] = await db.insert(schema.deals).values({ id, ...p.data, status: "awaiting_funding" }).returning();
  await audit(id, "deal_created", `brand:${p.data.brandId}`, { title: p.data.title, amountNgn: p.data.amountNgn, brief: p.data.brief, mandate: p.data.mandate });
  return ok(deal, 201);
});
