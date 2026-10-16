// Lean TS port of paj_client.rs
import { AppError } from "./errors";

const BASE = process.env.PAJ_SERVICE_URL || "https://paj-ramp-service-production-deb7.up.railway.app/";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export type PajBank = { id: string; name: string; code: string; country: string };
export type OnrampOrder = {
  id: string; accountNumber: string; accountName: string; bank: string;
  fiatAmount: number; amount: number; rate: number; fee: number; status: string;
};
export type OfframpOrder = { id: string; address: string; amount: number; fiatAmount: number; rate: number; fee: number; status: string };
export type PajTransaction = { id: string; status: string; transactionType: string; createdAt: string; amount?: number; fiatAmount?: number };

function errMsg(error: unknown): string {
  if (error == null) return "unknown error";
  if (typeof error === "string") return error;
  if (Array.isArray(error)) return error.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(", ");
  return JSON.stringify(error);
}

const RETRYABLE = ["failed to get mint info", "too many requests", "429", "timeout", "timed out", "temporarily unavailable", "connection reset", "connection refused", "network", "fetch failed"];
const isRetryable = (m: string) => RETRYABLE.some((r) => m.toLowerCase().includes(r));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call<T>(method: string, path: string, opts: { token?: string; body?: unknown; retries?: number } = {}): Promise<T> {
  const attempts = opts.retries ?? 1;
  let last = "";
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      });
      const text = await res.text();
      let json: { success?: boolean; data?: T; error?: unknown };
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`PAJ bad response (${res.status}): ${text.slice(0, 200)}`);
      }
      if (!json.success || json.data === undefined) throw new Error(`PAJ API error: ${errMsg(json.error)}`);
      return json.data;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
      if (i < attempts && isRetryable(last)) {
        await sleep(250 * i);
        continue;
      }
      break;
    }
  }
  // Only treat as a dead session on auth-ish errors, not on any message containing a path like /session/...
  const sessionDead = !/bad response \(404\)/.test(last) && /unauthori|expired|invalid token|session is invalid|\(401\)|\(403\)/i.test(last);
  throw new AppError(
    sessionDead ? "PAJ_SESSION_INVALID" : "PAJ_ERROR",
    last,
    sessionDead ? "reauthenticate_paj_session" : "retry_later",
    502,
  );
}

export const paj = {
  rates: () => call<{ onRampRate: { rate: number }; offRampRate: { rate: number } }>("GET", "/rates", { retries: 3 }),
  initiateSession: (contact: string) => call<{ email?: string }>("POST", "/session/initiate", { body: { contact } }),
  async verifySession(contact: string, otp: string) {
    const body = { contact, otp, deviceInfo: { uuid: `kobolt-${Date.now()}`, device: "Server", os: "Linux", browser: "Kobolt", ip: "0.0.0.0" } };
    try {
      return await call<{ token: string; expiresAt: string }>("POST", "/session/verify", { body });
    } catch (e) {
      // Paj sometimes needs a moment to activate the session
      if (e instanceof Error && e.message.includes("Session is invalid or expired")) {
        await sleep(3000);
        return call<{ token: string; expiresAt: string }>("POST", "/session/verify", { body });
      }
      throw e;
    }
  },
  banks: (token: string) => call<PajBank[]>("GET", "/banks", { token, retries: 3 }),
  resolveBank: (token: string, bankId: string, accountNumber: string) =>
    call<{ accountName: string; accountNumber: string; bank: PajBank }>("POST", "/banks/resolve", { token, body: { bankId, accountNumber } }),
  createOnramp: (token: string, fiatAmountNgn: number, recipient: string, webhookUrl?: string) =>
    call<OnrampOrder>("POST", "/orders/onramp", {
      token,
      body: { fiatAmount: fiatAmountNgn, currency: "NGN", recipient, mint: USDC_MINT, chain: "SOLANA", webhookUrl },
    }),
  createOfframp: (token: string, amountUsdc: number, bankId: string, accountNumber: string, webhookUrl?: string) =>
    call<OfframpOrder>("POST", "/orders/offramp", {
      token,
      retries: 3,
      body: { amount: amountUsdc, currency: "USD", bank: bankId, accountNumber, mint: USDC_MINT, webhookUrl },
    }),
  transaction: (token: string, id: string) => call<PajTransaction>("GET", `/transactions/${encodeURIComponent(id)}`, { token, retries: 3 }),
};
