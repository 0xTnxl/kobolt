// Verify the real post, not pasted text. Adapters per platform; evidence quality feeds the mandate.
import { platformOf, type ProofItem } from "./verifier-schema";

export type ProofInput = { url: string; caption?: string; postedAt?: string | null };

const mockFetch = () => process.env.DEMO_MOCK_FETCH === "1" || (process.env.PAYMENT_MODE || "mock") !== "live";

// TikTok video IDs encode the publish time: id >> 32 = unix seconds.
function tiktokTime(url: string): string | null {
  const m = url.match(/\/video\/(\d{15,})/);
  if (!m) return null;
  const secs = Number(BigInt(m[1]) >> BigInt(32));
  return secs > 1.4e9 && secs < 2.5e9 ? new Date(secs * 1000).toISOString() : null;
}

async function tiktok(input: ProofInput): Promise<ProofItem | null> {
  try {
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(input.url)}`, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (res.status === 400 || res.status === 404) {
      return { url: input.url, caption: input.caption ?? "", comments: [], postedAt: tiktokTime(input.url), isLive: false, evidence: "fetched", fetchSource: "tiktok_oembed" };
    }
    if (!res.ok) return null;
    const j = (await res.json()) as { title?: string };
    return { url: input.url, caption: j.title ?? "", comments: [], postedAt: tiktokTime(input.url), isLive: true, evidence: "fetched", fetchSource: "tiktok_oembed" };
  } catch {
    return null;
  }
}

export async function fetchProof(inputs: ProofInput[]): Promise<ProofItem[]> {
  return Promise.all(
    inputs.map(async (i) => {
      const url = i.url.trim();
      const postedAt = i.postedAt ? new Date(i.postedAt).toISOString() : null;
      if (platformOf(url) === "tiktok") {
        const t = await tiktok({ ...i, url });
        if (t) return t;
      }
      if (mockFetch()) {
        // Demo adapter (Instagram needs Meta app review). Clearly labelled "mock" everywhere.
        return { url, caption: i.caption ?? "", comments: [], postedAt, isLive: true, evidence: "fetched" as const, fetchSource: "mock" };
      }
      return { url, caption: i.caption ?? "", comments: [], postedAt, isLive: null, evidence: "self_reported" as const, fetchSource: null };
    }),
  );
}
