"use client";
import { useCallback, useEffect, useState } from "react";
import { api, Btn, Card, errText, Input, Nav, ngn, short, Status } from "@/components/ui";
import type { Deal, Brand, Creator } from "@/lib/types";

type State = {
  mode: string;
  brands: Brand[];
  creators: Creator[];
  deals: Deal[];
  paj: { email: string | null; connected: boolean };
  treasury: { address?: string; agent?: string; sol?: number; error?: string };
  ledgerHeldUsdc: number;
};

const in7d = () => new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 16);
const split = (v: string) => v.split(/,/).map((x) => x.trim()).filter(Boolean);

export default function Home() {
  const [s, setS] = useState<State | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    title: "GlowSkin Vitamin C launch",
    amountNgn: "5000",
    platform: "instagram",
    format: "reel",
    count: "1",
    hashtags: "#GlowSkinLaunch",
    brandNames: "GlowSkin, @glowskin",
    disclosures: "#ad",
    competitors: "Lumi Skin, Lumi",
    bannedClaims: "cures acne, guaranteed results, clears pimples",
    notes: "Promote the new Vitamin C serum",
    deadline: in7d(),
    maxAuto: "10",
    minConf: "0.8",
    requireFetched: true,
  });

  const load = useCallback(() => api<State>("/api/state").then(setS).catch((e) => setErr(errText(e))), []);
  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  async function create() {
    if (!s?.brands[0] || !s.creators[0]) return setErr("Seed demo data first (Ops page)");
    setBusy(true);
    setErr("");
    try {
      const d = await api<Deal>("/api/deals", {
        body: {
          brandId: s.brands[0].id,
          creatorId: s.creators[0].id,
          title: f.title,
          amountNgn: Number(f.amountNgn),
          brief: {
            platform: f.platform, format: f.format, count: Number(f.count), hashtags: split(f.hashtags), brandNames: split(f.brandNames),
            disclosures: split(f.disclosures), competitors: split(f.competitors), bannedClaims: split(f.bannedClaims), notes: f.notes || undefined,
            deadline: new Date(f.deadline).toISOString(),
          },
          mandate: { maxAutoReleaseUsdc: Number(f.maxAuto), minConfidence: Number(f.minConf), requireFetchedProof: f.requireFetched },
        },
      });
      window.location.href = `/deals/${d.id}`;
    } catch (e) {
      setErr(errText(e));
      setBusy(false);
    }
  }

  const up = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const sel = "mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm";

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Pay creators the moment the work is verified.</h1>
            <p className="mt-1 text-gray-500">Each deal gets its own USDC escrow account on Solana. An adapted AI agent, capped by an on-chain allowance, checks delivery against the brief and releases naira to the creator.</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${s?.mode === "live" ? "bg-gray-900 text-white" : "bg-amber-50 text-emerald-700"}`}>
            {s?.mode === "live" ? "LIVE · Solana mainnet + Paj" : "SANDBOX · mock rails"}
          </span>
        </div>

        {err && <p className="rounded-lg bg-rose-50 p-3 text-sm text-emerald-700">{err}</p>}

        <div className="grid gap-4 md:grid-cols-3">
          <Card title="Held across deals">
            <p className="text-2xl font-bold">{(s?.ledgerHeldUsdc ?? 0).toFixed(2)} USDC</p>
            <p className="text-xs text-gray-500">Each in its own on-chain account. Moves only on verified release or refund.</p>
          </Card>
          <Card title="Agent key (SPL delegate)">
            {s?.treasury?.agent ? (
              <>
                <a className="text-sm text-emerald-700 hover:underline" target="_blank" rel="noreferrer" href={`https://solscan.io/account/${s.treasury.agent}`}>{short(s.treasury.agent)} ↗</a>
                <p className="mt-1 text-xs text-gray-500">Can only move what each deal approved. Fee wallet: {(s.treasury.sol ?? 0).toFixed(4)} SOL</p>
              </>
            ) : (
              <p className="text-sm text-gray-500">{s?.treasury?.error ?? "Loading…"}</p>
            )}
          </Card>
          <Card title="Paj rails">
            <p className="text-2xl font-bold">{s?.paj.connected ? "Connected" : "Not connected"}</p>
            <a href="/ops" className="text-xs text-emerald-700 hover:underline">{s?.paj.email ?? "Connect on Ops →"}</a>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          <Card title="New deal" className="lg:col-span-2">
            <div className="space-y-3">
              <p className="text-xs text-gray-500">{s?.brands[0]?.name ?? "Brand"} → {s?.creators[0]?.name ?? "Creator"}</p>
              <Input label="Title" value={f.title} onChange={up("title")} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Amount (₦)" type="number" value={f.amountNgn} onChange={up("amountNgn")} />
                <Input label="Posts" type="number" value={f.count} onChange={up("count")} />
                <label className="text-xs text-gray-500">Platform
                  <select className={sel} value={f.platform} onChange={up("platform")}>
                    <option value="instagram">Instagram</option><option value="tiktok">TikTok</option><option value="youtube">YouTube</option><option value="x">X</option>
                  </select>
                </label>
                <label className="text-xs text-gray-500">Format
                  <select className={sel} value={f.format} onChange={up("format")}>
                    <option value="reel">Reel</option><option value="any">Any</option>
                  </select>
                </label>
              </div>
              <Input label="Required hashtags (comma-separated)" value={f.hashtags} onChange={up("hashtags")} />
              <Input label="Brand names / handles" value={f.brandNames} onChange={up("brandNames")} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Accepted disclosures" value={f.disclosures} onChange={up("disclosures")} />
                <Input label="Competitor blocklist" value={f.competitors} onChange={up("competitors")} />
              </div>
              <Input label="Banned claims" value={f.bannedClaims} onChange={up("bannedClaims")} />
              <Input label="Notes for the verifier" value={f.notes} onChange={up("notes")} />
              <Input label="Deadline" type="datetime-local" value={f.deadline} onChange={up("deadline")} />
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="mb-2 text-xs font-semibold text-emerald-700">Agent mandate: bounded authority</p>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Auto-release cap (USDC)" type="number" value={f.maxAuto} onChange={up("maxAuto")} />
                  <Input label="Min agreement (0-1)" type="number" step="0.1" value={f.minConf} onChange={up("minConf")} />
                </div>
                <label className="mt-2 flex items-center gap-2 text-xs text-gray-700">
                  <input type="checkbox" checked={f.requireFetched} onChange={(e) => setF({ ...f, requireFetched: e.target.checked })} /> Only auto-release fetched proof (not self-reported)
                </label>
              </div>
              <Btn onClick={create} disabled={busy}>{busy ? "Creating…" : "Create deal"}</Btn>
            </div>
          </Card>

          <Card title="Deals" className="lg:col-span-3">
            {!s?.deals.length && <p className="text-sm text-gray-500">No deals yet.</p>}
            <ul className="divide-y divide-gray-100">
              {s?.deals.map((d) => (
                <li key={d.id}>
                  <a href={`/deals/${d.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-gray-50">
                    <div>
                      <p className="font-semibold">{d.title}</p>
                      <p className="text-xs text-gray-500">{d.id} · {ngn(d.amountNgn)}{d.heldUsdcMicro ? ` · ${(d.heldUsdcMicro / 1e6).toFixed(2)} USDC` : ""}</p>
                    </div>
                    <Status s={d.status} />
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </main>
    </>
  );
}
