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
    <section className={`rounded-xl border border-gray-200 bg-white shadow-sm p-5 ${className}`}>
      {(title || right) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Btn({ children, onClick, disabled, variant = "primary", type = "button" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; variant?: "primary" | "ghost" | "danger"; type?: "button" | "submit" }) {
  const v = {
    primary: "bg-gray-900 text-white hover:bg-gray-700",
    ghost: "border border-gray-300 bg-white text-gray-800 hover:bg-gray-50",
    danger: "bg-rose-600 text-white hover:bg-rose-500",
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
    <label className="block text-xs text-gray-500">
      {label}
      <input {...rest} className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900" />
    </label>
  );
}

const STATUS: Record<string, string> = {
  awaiting_funding: "bg-amber-50 text-amber-700 ring-amber-200",
  held: "bg-sky-50 text-sky-700 ring-sky-200",
  verifying: "bg-violet-50 text-violet-700 ring-violet-200",
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  held_review: "bg-orange-50 text-orange-700 ring-orange-200",
  releasing: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  released: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  settled: "bg-emerald-600 text-white ring-emerald-600",
  refunding: "bg-gray-100 text-gray-700 ring-gray-200",
  refunded: "bg-gray-100 text-gray-700 ring-gray-200",
  cancelled: "bg-gray-100 text-gray-500 ring-gray-200",
  failed: "bg-rose-50 text-rose-700 ring-rose-200",
};
export function Status({ s }: { s: string }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${STATUS[s] ?? "bg-gray-100"}`}>{s.replace("_", " ")}</span>;
}

export const ngn = (n: number) => `₦${Math.round(n).toLocaleString()}`;
export const short = (s?: string | null, n = 6) => (s ? (s.length > n * 2 + 1 ? `${s.slice(0, n)}…${s.slice(-n)}` : s) : "");
export const txUrl = (sig?: string | null) => (sig && !sig.startsWith("mock") ? `https://solscan.io/tx/${sig}` : null);

export function Nav() {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a href="/" className="text-lg font-semibold tracking-tight">
          <span className="mr-1.5 inline-block h-3 w-3 rounded-sm bg-emerald-600 align-[-1px]" />Kobolt
        </a>
        <nav className="flex gap-5 text-sm text-gray-500">
          <a href="/" className="hover:text-gray-900">Deals</a>
          <a href="/lab" className="hover:text-gray-900">Verifier lab</a>
          <a href="/p/amaka_stories" className="hover:text-gray-900">Portfolio</a>
          <a href="/ops" className="hover:text-gray-900">Ops</a>
        </nav>
      </div>
    </header>
  );
}
