import { and, eq, inArray, desc } from "drizzle-orm";
import { db, schema } from "@/db";

// Public credibility layer: built ONLY from released/settled deals. No bank/PII fields exposed.
export async function getPortfolio(handle: string) {
  const [c] = await db.select().from(schema.creators).where(eq(schema.creators.handle, handle));
  if (!c) return null;
  const deals = await db
    .select({
      id: schema.deals.id,
      title: schema.deals.title,
      brief: schema.deals.brief,
      amountNgn: schema.deals.amountNgn,
      heldUsdcMicro: schema.deals.heldUsdcMicro,
      payoutTx: schema.deals.payoutTx,
      verdict: schema.deals.verdict,
      updatedAt: schema.deals.updatedAt,
      brandName: schema.brands.name,
      rating: schema.reviews.rating,
      comment: schema.reviews.comment,
    })
    .from(schema.deals)
    .innerJoin(schema.brands, eq(schema.brands.id, schema.deals.brandId))
    .leftJoin(schema.reviews, eq(schema.reviews.dealId, schema.deals.id))
    .where(and(eq(schema.deals.creatorId, c.id), inArray(schema.deals.status, ["released", "settled"])))
    .orderBy(desc(schema.deals.updatedAt));

  const ratings = deals.map((d) => d.rating).filter((r): r is number => r != null);
  return {
    handle: c.handle,
    name: c.name,
    niche: c.niche,
    bio: c.bio,
    photoUrl: c.photoUrl,
    socialLink: c.socialLink,
    bankVerified: !!c.accountName,
    stats: {
      totalVerifiedEarningsNgn: deals.reduce((a, d) => a + d.amountNgn, 0),
      totalVerifiedUsdc: deals.reduce((a, d) => a + d.heldUsdcMicro, 0) / 1e6,
      completedDeals: deals.length,
      averageRating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
    },
    history: deals.map((d) => ({
      dealId: d.id,
      brandName: d.brandName,
      title: d.title,
      deliverable: `${d.brief.count} ${d.brief.platform} ${d.brief.format === "reel" ? "reel" : "post"}${d.brief.count > 1 ? "s" : ""}`,
      amountNgn: d.amountNgn,
      payoutTx: d.payoutTx,
      verifiedBy: d.verdict?.autoRelease ? "Kobolt verifier agent" : "Brand review",
      evidenceHash: d.verdict?.evidenceHash ?? null,
      completedAt: d.updatedAt,
      review: d.rating ? { rating: d.rating, comment: d.comment } : null,
    })),
  };
}
