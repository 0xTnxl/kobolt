import crypto from "crypto";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

const SECRET = () => process.env.AUDIT_SECRET || "dev-audit-secret";

// Append a hash-chained, HMAC-signed event. Signed approvals = who/what/which policy.
export async function audit(dealId: string, type: string, actor: string, data: Record<string, unknown> = {}) {
  const [prev] = await db
    .select({ hash: schema.events.hash })
    .from(schema.events)
    .where(eq(schema.events.dealId, dealId))
    .orderBy(desc(schema.events.id))
    .limit(1);
  const prevHash = prev?.hash ?? null;
  const at = new Date().toISOString();
  const payload = JSON.stringify({ dealId, type, actor, data, prevHash, at });
  const hash = crypto.createHash("sha256").update(payload).digest("hex");
  const signature = crypto.createHmac("sha256", SECRET()).update(hash).digest("hex");
  await db.insert(schema.events).values({ dealId, type, actor, data, prevHash, hash, signature, createdAt: new Date(at) });
  return hash;
}
