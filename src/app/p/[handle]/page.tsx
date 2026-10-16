import { notFound } from "next/navigation";
import { getPortfolio } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

const ngn = (n: number) => `₦${Math.round(n).toLocaleString()}`;

export default async function Portfolio({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const p = await getPortfolio(handle);
  if (!p) notFound();
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <a href="/" className="text-sm font-black"><span className="text-emerald-400">⚡</span> Kobolt</a>
      <header className="flex items-center gap-5">
        <div className="grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-sky-500 text-3xl font-black text-slate-950">{p.name[0]}</div>
        <div>
          <h1 className="text-3xl font-black">{p.name}</h1>
          <p className="text-slate-400">@{p.handle} · {p.niche}</p>
          <p className="mt-1 text-xs text-emerald-300">{p.bankVerified ? "✓ Bank-verified payee" : ""}</p>
        </div>
      </header>
      {p.bio && <p className="text-slate-300">{p.bio}</p>}

      <section className="grid grid-cols-3 gap-4">
        {[
          ["Verified earnings", ngn(p.stats.totalVerifiedEarningsNgn)],
          ["Completed deals", String(p.stats.completedDeals)],
          ["Avg rating", p.stats.averageRating ? `${p.stats.averageRating} ★` : "-"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500">{k}</p>
            <p className="mt-1 text-2xl font-bold">{v}</p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">Verified deal history</h2>
        <p className="mb-4 text-xs text-slate-500">Every entry is a deal Kobolt actually held in escrow, verified against the brief, and paid out on-chain. Nothing self-reported.</p>
        {!p.history.length && <p className="text-sm text-slate-500">No completed deals yet.</p>}
        <ul className="space-y-3">
          {p.history.map((h) => (
            <li key={h.dealId} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex justify-between gap-3">
                <div>
                  <p className="font-semibold">{h.brandName} · {h.title}</p>
                  <p className="text-xs text-slate-500">{h.dealId} · {h.deliverable} · verified by {h.verifiedBy}</p>
                </div>
                <p className="font-bold text-emerald-300">{ngn(h.amountNgn)}</p>
              </div>
              {h.review && <p className="mt-2 text-sm"><span className="text-amber-300">{"★".repeat(h.review.rating)}</span> {h.review.comment}</p>}
              {h.payoutTx && !h.payoutTx.startsWith("mock") && (
                <a href={`https://solscan.io/tx/${h.payoutTx}`} target="_blank" className="mt-1 block text-xs text-emerald-400 hover:underline">Payout proof on Solana ↗</a>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
