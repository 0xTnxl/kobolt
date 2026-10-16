import { pgTable, text, integer, bigint, jsonb, timestamp, doublePrecision, serial } from "drizzle-orm/pg-core";

import type { Decision, ProofItem, RuleResult, Platform } from "@/lib/verifier-schema";

export type Brief = {
  platform: Platform;
  format: "reel" | "any";
  count: number;
  hashtags: string[];
  brandNames: string[];
  disclosures: string[]; // accepted tokens, e.g. ["#ad"]
  competitors: string[];
  bannedClaims: string[];
  deadline: string; // ISO
  notes?: string;
};

export type Mandate = {
  maxAutoReleaseUsdc: number;
  minConfidence: number;
  requireFetchedProof: boolean;
};

export type Proof = { items: ProofItem[]; submittedAt: string };

export type Verdict = Decision & { rules: RuleResult[]; model: string; samples: number; latencyMs: number };

export const brands = pgTable("brands", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  email: text("email"),
  bankId: text("bank_id"),
  bankName: text("bank_name"),
  accountNumber: text("account_number"),
  accountName: text("account_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const creators = pgTable("creators", {
  id: text("id").primaryKey(),
  handle: text("handle").notNull().unique(),
  name: text("name").notNull(),
  niche: text("niche"),
  bio: text("bio"),
  photoUrl: text("photo_url"),
  socialLink: text("social_link"),
  bankId: text("bank_id"),
  bankName: text("bank_name"),
  accountNumber: text("account_number"),
  accountName: text("account_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// status: awaiting_funding → held → submitted → (releasing → released → settled) | held_review | refunding → refunded | failed
export const deals = pgTable("deals", {
  id: text("id").primaryKey(),
  brandId: text("brand_id").notNull(),
  creatorId: text("creator_id").notNull(),
  title: text("title").notNull(),
  brief: jsonb("brief").$type<Brief>().notNull(),
  mandate: jsonb("mandate").$type<Mandate>().notNull(),
  amountNgn: doublePrecision("amount_ngn").notNull(),
  heldUsdcMicro: bigint("held_usdc_micro", { mode: "number" }).default(0).notNull(),
  status: text("status").notNull(),
  onramp: jsonb("onramp").$type<Record<string, unknown>>(),
  fundingTx: text("funding_tx"),
  payout: jsonb("payout").$type<Record<string, unknown>>(),
  payoutTx: text("payout_tx"),
  proof: jsonb("proof").$type<Proof>(),
  verdict: jsonb("verdict").$type<Verdict>(),
  lastError: jsonb("last_error").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Append-only, hash-chained, HMAC-signed audit log
export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  dealId: text("deal_id").notNull(),
  type: text("type").notNull(),
  actor: text("actor").notNull(), // agent:verifier-v1 | brand:<id> | creator:<id> | system | admin
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  prevHash: text("prev_hash"),
  hash: text("hash").notNull(),
  signature: text("signature").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const reviews = pgTable("reviews", {
  dealId: text("deal_id").primaryKey(),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const kv = pgTable("kv", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
