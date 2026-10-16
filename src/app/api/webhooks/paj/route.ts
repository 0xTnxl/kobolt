import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { ok, route } from "@/lib/errors";
import { sync } from "@/lib/engine";

// Paj webhooks are unsigned: treat them as hints only and re-confirm state via GET /transactions/:id (inside sync).
export const POST = route(async (req: NextRequest) => {
  const p = await req.json().catch(() => ({}));
  const orderId = typeof p?.orderId === "string" ? p.orderId : null;
  if (!orderId) return ok({ ignored: true });
  const rows = await db
    .select({ id: schema.deals.id })
    .from(schema.deals)
    .where(sql`${schema.deals.onramp}->>'id' = ${orderId} or ${schema.deals.payout}->>'id' = ${orderId}`);
  for (const r of rows) await sync(r.id);
  return ok({ received: true, matched: rows.length });
});
