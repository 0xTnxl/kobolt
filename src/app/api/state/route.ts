import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { ok, route } from "@/lib/errors";
import { kvGet, LIVE, syncAll } from "@/lib/engine";
import { treasuryBalances } from "@/lib/solana";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await syncAll().catch(() => {});
  const [brands, creators, deals, pajEmail, pajToken, treasury] = await Promise.all([
    db.select().from(schema.brands),
    db.select().from(schema.creators),
    db.select().from(schema.deals).orderBy(desc(schema.deals.createdAt)),
    kvGet("paj_email"),
    kvGet("paj_token"),
    LIVE() ? treasuryBalances().catch((e) => ({ error: String(e.message ?? e) })) : Promise.resolve({ error: "sandbox mode: no chain" }),
  ]);
  const heldMicro = deals.filter((d) => ["held", "verifying", "held_review", "approved", "releasing", "refunding"].includes(d.status)).reduce((a, d) => a + d.heldUsdcMicro, 0);
  const strip = <T extends { accountNumber: string | null }>(x: T) => ({ ...x, accountNumber: x.accountNumber ? `******${x.accountNumber.slice(-4)}` : null });
  return ok({ mode: LIVE() ? "live" : "mock", brands: brands.map(strip), creators: creators.map(strip), deals, paj: { email: pajEmail, connected: !!pajToken }, treasury, ledgerHeldUsdc: heldMicro / 1e6 });
});
