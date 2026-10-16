"use client";
import { use, useCallback, useEffect, useState } from "react";
import { api, Btn, errText, Input, ngn, short, txUrl } from "@/components/ui";

type On = { dealWallet: string; tokenAccount?: string; expectedUsdcMicro: number; rate: number; paj: { accountNumber: string; accountName: string; bank: string; fiatAmount: number; amount: number } | null };
type V = { id: string; title: string; amountNgn: number; status: string; brand?: string; creator?: { name: string; handle: string }; mode: string; onramp: On | null; fundingTx: string | null; heldUsdc: number };

export default function Pay({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [v, setV] = useState<V | null>(null);
  const [tab, setTab] = useState<"ngn" | "usdc">("ngn");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api<V>(`/api/pay/${id}`).then(setV).catch((e) => setErr(errText(e))), [id]);
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);

  const step = async (body: Record<string, unknown>, after?: () => void) => {
    setBusy(true); setErr("");
    try { const r = await api<V | { otpSent: boolean }>(`/api/pay/${id}`, { body }); if ("id" in r) setV(r); after?.(); } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };

  if (!v) return <main className="grid min-h-screen place-items-center text-gray-500">{err || "Loading…"}</main>;
  const on = v.onramp;
  const funded = v.status !== "awaiting_funding";

  return (
    <main className="mx-auto max-w-md space-y-5 px-5 py-10">
      <p className="text-sm font-semibold"><span className="mr-1.5 inline-block h-3 w-3 rounded-sm bg-emerald-600 align-[-1px]" />Kobolt Pay</p>
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
        <p className="text-xs text-gray-500">{v.id} · {v.brand} → {v.creator?.name}</p>
        <h1 className="text-xl font-semibold">{v.title}</h1>
        <p className="mt-2 text-3xl font-semibold">{ngn(v.amountNgn)}</p>
        <p className="mt-2 text-xs text-gray-500">Your money is held in this deal&apos;s own escrow account on Solana. It&apos;s released to the creator only after Kobolt&apos;s agent verifies the work. If it isn&apos;t delivered, you get refunded.</p>
      </div>

      {funded ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-lg font-bold text-emerald-700">✓ Funded and held in escrow</p>
          <p className="text-sm">{v.heldUsdc.toFixed(2)} USDC locked for this deal.</p>
          {txUrl(v.fundingTx) && <a className="text-sm text-emerald-700 hover:underline" target="_blank" rel="noreferrer" href={txUrl(v.fundingTx)!}>View on Solscan ↗</a>}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <button onClick={() => setTab("ngn")} className={`rounded-lg py-2 ${tab === "ngn" ? "bg-gray-900 font-bold text-white" : "bg-gray-100"}`}>Pay in Naira</button>
            <button onClick={() => { setTab("usdc"); if (!on) step({ step: "usdc" }); }} className={`rounded-lg py-2 ${tab === "usdc" ? "bg-gray-900 font-bold text-white" : "bg-gray-100"}`}>Pay in USDC</button>
          </div>

          {tab === "ngn" && (
            <div className="space-y-3 rounded-xl border border-gray-200 bg-white shadow-sm p-5">
              {on?.paj ? (
                <>
                  <p className="text-sm text-gray-500">Transfer exactly this amount from any Nigerian bank:</p>
                  <div className="rounded-xl bg-gray-50 p-4 font-mono">
                    <p className="text-2xl font-bold">{ngn(on.paj.fiatAmount)}</p>
                    <p className="text-lg">{on.paj.accountNumber}</p>
                    <p className="text-sm text-gray-500">{on.paj.bank} · {on.paj.accountName}</p>
                    <p className="mt-2 text-xs text-gray-500">≈ {on.paj.amount.toFixed(2)} USDC @ ₦{on.rate.toLocaleString()} via Paj</p>
                  </div>
                  {v.mode === "mock" ? (
                    <Btn onClick={() => step({ step: "simulate" })} disabled={busy}>Simulate bank transfer</Btn>
                  ) : (
                    <p className="animate-pulse text-xs text-amber-700">Waiting for your transfer… this page updates automatically.</p>
                  )}
                </>
              ) : !sent ? (
                <>
                  <p className="text-sm text-gray-500">Verify your email. Our payment partner Paj will send you a one-time code.</p>
                  <Input label="Your email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  <Btn disabled={busy || !email.includes("@")} onClick={() => step({ step: "initiate", email }, () => setSent(true))}>{busy ? "Sending…" : "Send code"}</Btn>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-500">Enter the code sent to {email}{v.mode === "mock" ? " (sandbox: any 6 digits)" : ""}.</p>
                  <Input label="Code" inputMode="numeric" value={otp} onChange={(e) => setOtp(e.target.value.trim())} />
                  <div className="flex gap-2">
                    <Btn disabled={busy || otp.length < 4} onClick={() => step({ step: "verify", otp })}>{busy ? "Verifying…" : "Get bank details"}</Btn>
                    <Btn variant="ghost" onClick={() => { setSent(false); setOtp(""); }}>Change email</Btn>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === "usdc" && (
            <div className="space-y-3 rounded-xl border border-gray-200 bg-white shadow-sm p-5">
              {on ? (
                <>
                  <p className="text-sm text-gray-500">Send USDC (Solana) to this deal&apos;s escrow wallet:</p>
                  <div className="rounded-xl bg-gray-50 p-4">
                    <p className="text-2xl font-bold">{(on.expectedUsdcMicro / 1e6).toFixed(2)} USDC</p>
                    <p className="break-all font-mono text-sm">{on.dealWallet}</p>
                    <button className="mt-2 text-xs text-emerald-700" onClick={() => navigator.clipboard.writeText(on.dealWallet)}>Copy address</button>
                  </div>
                  <p className="text-xs text-gray-500">USDC mint EPjF…Dt1v only. Detected automatically on arrival.</p>
                  {v.mode === "mock" && <Btn onClick={() => step({ step: "simulate" })} disabled={busy}>Simulate USDC deposit</Btn>}
                  {!v.mode.includes("mock") && <a className="text-xs text-emerald-700" target="_blank" rel="noreferrer" href={`https://solscan.io/account/${on.dealWallet}`}>Watch {short(on.dealWallet)} on Solscan ↗</a>}
                </>
              ) : <p className="text-sm text-gray-500">Preparing escrow account…</p>}
            </div>
          )}
        </>
      )}
      {err && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{err}</p>}
    </main>
  );
}
