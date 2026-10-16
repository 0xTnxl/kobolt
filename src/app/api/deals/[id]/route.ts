import { NextRequest } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ok, route } from "@/lib/errors";
import { sync } from "@/lib/engine";

export const dynamic = "force-dynamic";

export const GET = route(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const deal = await sync(id);
  const [events, brand, creator] = await Promise.all([
    db.select().from(schema.events).where(eq(schema.events.dealId, id)).orderBy(asc(schema.events.id)),
    db.select().from(schema.brands).where(eq(schema.brands.id, deal.brandId)).then((r) => r[0]),
    db.select().from(schema.creators).where(eq(schema.creators.id, deal.creatorId)).then((r) => r[0]),
  ]);
  return ok({ deal, events, brand: { id: brand?.id, name: brand?.name, slug: brand?.slug }, creator: { id: creator?.id, handle: creator?.handle, name: creator?.name, accountName: creator?.accountName, bankName: creator?.bankName } });
});
