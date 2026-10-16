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
      <a href="/" className="text-sm font-semibold"><span className="mr-1.5 inline-block h-3 w-3 rounded-sm bg-emerald-600 align-[-1px]" />Kobolt</a>
      <header className="flex items-center gap-5">
        <div className="grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-sky-500 text-3xl font-semibold text-white">{p.name[0]}</div>
        <div>
          <h1 className="text-3xl font-semibold">{p.name}</h1>
          <p className="text-gray-500">@{p.handle} · {p.niche}</p>
          <p className="mt-1 text-xs text-emerald-700">{p.bankVerified ? "✓ Bank-verified payee" : ""}</p>
        </div>
      </header>
      {p.bio && <p className="text-gray-700">{p.bio}</p>}

      <section className="grid grid-cols-3 gap-4">
        {[
          ["Verified earnings", ngn(p.stats.totalVerifiedEarningsNgn)],
          ["Completed deals", String(p.stats.completedDeals)],
          ["Avg rating", p.stats.averageRating ? `${p.stats.averageRating} ★` : "-"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
            <p className="text-xs uppercase tracking-wider text-gray-500">{k}</p>
            <p className="mt-1 text-2xl font-bold">{v}</p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Verified deal history</h2>
        <p className="mb-4 text-xs text-gray-500">Every entry is a deal Kobolt actually held in escrow, verified against the brief, and paid out on-chain. Nothing self-reported.</p>
        {!p.history.length && <p className="text-sm text-gray-500">No completed deals yet.</p>}
        <ul className="space-y-3">
          {p.history.map((h) => (
            <li key={h.dealId} className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
              <div className="flex justify-between gap-3">
                <div>
                  <p className="font-semibold">{h.brandName} · {h.title}</p>
                  <p className="text-xs text-gray-500">{h.dealId} · {h.deliverable} · verified by {h.verifiedBy}</p>
                </div>
                <p className="font-bold text-emerald-700">{ngn(h.amountNgn)}</p>
              </div>
              {h.review && <p className="mt-2 text-sm"><span className="text-amber-500">{"★".repeat(h.review.rating)}</span> {h.review.comment}</p>}
              {h.payoutTx && !h.payoutTx.startsWith("mock") && (
                <a href={`https://solscan.io/tx/${h.payoutTx}`} target="_blank" className="mt-1 block text-xs text-emerald-700 hover:underline">Payout proof on Solana ↗</a>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
