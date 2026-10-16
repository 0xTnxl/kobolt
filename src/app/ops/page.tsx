"use client";
import { useCallback, useEffect, useState } from "react";
import { api, Btn, Card, errText, Input, Nav, short } from "@/components/ui";
import type { Brand, Creator } from "@/lib/types";

type State = { mode: string; brands: Brand[]; creators: Creator[]; paj: { email: string | null; connected: boolean }; treasury: { address?: string; agent?: string; sol?: number; error?: string } };
type Bank = { id: string; name: string; code: string };

export default function Ops() {
  const [s, setS] = useState<State | null>(null);
  const [msg, setMsg] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [banks, setBanks] = useState<Bank[]>([]);
  const [acct, setAcct] = useState({ kind: "creator", bankId: "", accountNumber: "" });

  const load = useCallback(() => api<State>("/api/state").then((x) => { setS(x); if (x.paj.email) setEmail((e) => e || x.paj.email!); }).catch((e) => setMsg(errText(e))), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (s?.paj.connected && !banks.length) api<Bank[]>("/api/ops/banks").then((b) => setBanks(b.sort((a, c) => a.name.localeCompare(c.name)))).catch((e) => setMsg(errText(e)));
  }, [s?.paj.connected, banks.length]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setMsg(`${label}…`);
    try { const r = await fn(); setMsg(`${label}: ${JSON.stringify(r)}`); await load(); } catch (e) { setMsg(errText(e)); }
  };

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        <h1 className="text-2xl font-black">Ops</h1>
        {msg && <p className="break-all rounded-lg bg-white/5 p-3 font-mono text-xs text-slate-300">{msg}</p>}

        <Card title="Demo data">
          <p className="mb-3 text-sm text-slate-400">{s?.brands.length ?? 0} brand(s), {s?.creators.length ?? 0} creator(s) · mode <b>{s?.mode}</b></p>
          <Btn onClick={() => run("Seed", () => api("/api/ops/seed", { body: {} }))}>Seed GlowSkin + Amaka</Btn>
        </Card>

        <Card title="Fee wallet + agent key (Solana mainnet)">
          {s?.treasury.address ? (
            <p className="space-y-1 text-sm">
              Fee wallet (fund with ~0.05 SOL): <a className="text-emerald-400" target="_blank" rel="noreferrer" href={`https://solscan.io/account/${s.treasury.address}`}>{s.treasury.address}</a> · {s.treasury.sol?.toFixed(4)} SOL
              <br />Agent delegate: <a className="text-emerald-400" target="_blank" rel="noreferrer" href={`https://solscan.io/account/${s.treasury.agent}`}>{s.treasury.agent}</a>
            </p>
          ) : <p className="text-sm text-slate-500">{s?.treasury.error}</p>}
        </Card>

        <Card title="Paj session" right={<span className={s?.paj.connected ? "text-emerald-400" : "text-amber-300"}>{s?.paj.connected ? "connected" : "not connected"}</span>}>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <Input label="Paj account email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Btn variant="ghost" onClick={() => run("OTP sent", () => api("/api/ops/paj-initiate", { body: { email } }))}>Send OTP</Btn>
            <Input label="OTP" value={otp} onChange={(e) => setOtp(e.target.value)} />
            <Btn onClick={() => run("Verified", () => api("/api/ops/paj-verify", { body: { otp } }))}>Verify</Btn>
          </div>
        </Card>

        <Card title="Payout / refund bank accounts (Paj name enquiry)">
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Creator: {s?.creators[0]?.accountName ? `${s.creators[0].accountName} · ${s.creators[0].bankName} · ${short(s.creators[0].accountNumber, 3)}` : "not set"}
              <br />Brand: {s?.brands[0]?.accountName ? `${s.brands[0].accountName} · ${s.brands[0].bankName}` : "not set"}
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs text-slate-400">For
                <select value={acct.kind} onChange={(e) => setAcct({ ...acct, kind: e.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm">
                  <option value="creator">Creator</option><option value="brand">Brand (refunds)</option>
                </select>
              </label>
              <label className="text-xs text-slate-400">Bank
                <select value={acct.bankId} onChange={(e) => setAcct({ ...acct, bankId: e.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm">
                  <option value="">{banks.length ? "Select bank" : "Connect Paj first"}</option>
                  {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
              <Input label="Account number" value={acct.accountNumber} onChange={(e) => setAcct({ ...acct, accountNumber: e.target.value.replace(/\D/g, "").slice(0, 10) })} />
            </div>
            <Btn
              disabled={!acct.bankId || acct.accountNumber.length !== 10}
              onClick={() => run("Resolved", () => api("/api/ops/bank-account", { body: { ...acct, id: acct.kind === "creator" ? s?.creators[0]?.id : s?.brands[0]?.id } }))}
            >
              Resolve & save
            </Btn>
          </div>
        </Card>
      </main>
    </>
  );
}
