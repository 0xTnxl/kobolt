"use client";
import { ReactNode } from "react";

export type ApiErr = { code: string; message: string; next_action: string };

export async function api<T = unknown>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: { "Content-Type": "application/json" },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const j = await res.json().catch(() => ({ success: false, error: { code: "BAD_RESPONSE", message: `HTTP ${res.status}`, next_action: "retry" } }));
  if (!j.success) {
    if (j.error?.code === "UNAUTHORIZED") window.location.href = `/unlock?next=${encodeURIComponent(location.pathname)}`;
    throw Object.assign(new Error(j.error?.message ?? "Request failed"), { api: j.error as ApiErr });
  }
  return j.data as T;
}

export const errText = (e: unknown) => {
  const a = (e as { api?: ApiErr }).api;
  return a ? `${a.code}: ${a.message} → ${a.next_action}` : String((e as Error)?.message ?? e);
};

export function Card({ title, children, right, className = "" }: { title?: ReactNode; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-white/10 bg-white/[0.03] p-5 ${className}`}>
      {(title || right) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Btn({ children, onClick, disabled, variant = "primary", type = "button" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; variant?: "primary" | "ghost" | "danger"; type?: "button" | "submit" }) {
  const v = {
    primary: "bg-emerald-400 text-slate-950 hover:bg-emerald-300",
    ghost: "border border-white/15 text-slate-200 hover:bg-white/5",
    danger: "bg-rose-500/90 text-white hover:bg-rose-400",
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${v}`}>
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...rest } = props;
  return (
    <label className="block text-xs text-slate-400">
      {label}
      <input {...rest} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400" />
    </label>
  );
}

const STATUS: Record<string, string> = {
  awaiting_funding: "bg-amber-400/15 text-amber-300",
  held: "bg-sky-400/15 text-sky-300",
  verifying: "bg-violet-400/15 text-violet-300",
  approved: "bg-emerald-400/15 text-emerald-300",
  held_review: "bg-orange-500/20 text-orange-300",
  releasing: "bg-emerald-400/15 text-emerald-300",
  released: "bg-emerald-400/20 text-emerald-300",
  settled: "bg-emerald-500/25 text-emerald-200",
  refunding: "bg-slate-400/15 text-slate-300",
  refunded: "bg-slate-400/20 text-slate-300",
  cancelled: "bg-slate-500/20 text-slate-400",
  failed: "bg-rose-500/20 text-rose-300",
};
export function Status({ s }: { s: string }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS[s] ?? "bg-white/10"}`}>{s.replace("_", " ")}</span>;
}

export const ngn = (n: number) => `₦${Math.round(n).toLocaleString()}`;
export const short = (s?: string | null, n = 6) => (s ? (s.length > n * 2 + 1 ? `${s.slice(0, n)}…${s.slice(-n)}` : s) : "");
export const txUrl = (sig?: string | null) => (sig && !sig.startsWith("mock") ? `https://solscan.io/tx/${sig}` : null);

export function Nav() {
  return (
    <header className="border-b border-white/10 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a href="/" className="text-lg font-black tracking-tight">
          <span className="text-emerald-400">⚡</span> Kobolt
        </a>
        <nav className="flex gap-5 text-sm text-slate-400">
          <a href="/" className="hover:text-white">Deals</a>
          <a href="/lab" className="hover:text-white">Verifier lab</a>
          <a href="/p/amaka_stories" className="hover:text-white">Portfolio</a>
          <a href="/ops" className="hover:text-white">Ops</a>
        </nav>
      </div>
    </header>
  );
}
