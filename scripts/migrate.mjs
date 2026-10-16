// Idempotent schema bootstrap. Runs on every deploy before `next start`.
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}
const sql = postgres(url, { max: 1 });

await sql.unsafe(`
CREATE TABLE IF NOT EXISTS brands (
  id text PRIMARY KEY, slug text NOT NULL UNIQUE, name text NOT NULL, email text,
  bank_id text, bank_name text, account_number text, account_name text,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS creators (
  id text PRIMARY KEY, handle text NOT NULL UNIQUE, name text NOT NULL, niche text, bio text,
  photo_url text, social_link text, bank_id text, bank_name text, account_number text, account_name text,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS deals (
  id text PRIMARY KEY, brand_id text NOT NULL REFERENCES brands(id), creator_id text NOT NULL REFERENCES creators(id),
  title text NOT NULL, brief jsonb NOT NULL, mandate jsonb NOT NULL,
  amount_ngn double precision NOT NULL, held_usdc_micro bigint NOT NULL DEFAULT 0,
  status text NOT NULL, onramp jsonb, funding_tx text, payout jsonb, payout_tx text,
  proof jsonb, verdict jsonb, last_error jsonb,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS deals_creator_idx ON deals(creator_id);
CREATE INDEX IF NOT EXISTS deals_status_idx ON deals(status);
CREATE TABLE IF NOT EXISTS events (
  id serial PRIMARY KEY, deal_id text NOT NULL, type text NOT NULL, actor text NOT NULL,
  data jsonb NOT NULL, prev_hash text, hash text NOT NULL, signature text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_deal_idx ON events(deal_id);
CREATE TABLE IF NOT EXISTS reviews (
  deal_id text PRIMARY KEY REFERENCES deals(id), rating integer NOT NULL, comment text,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS kv (
  key text PRIMARY KEY, value text NOT NULL, updated_at timestamp NOT NULL DEFAULT now()
);
`);
console.log("schema ok");
await sql.end();
