"use client";
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { api, Btn, errText, Input } from "@/components/ui";

function Unlock() {
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const next = useSearchParams().get("next") || "/";
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <form
        className="w-full max-w-sm space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api("/api/auth", { body: { passcode: pass } });
            window.location.href = next.startsWith("/") ? next : "/";
          } catch (e) {
            setErr(errText(e));
          }
        }}
      >
        <h1 className="text-xl font-black"><span className="text-emerald-400">⚡</span> Kobolt</h1>
        <Input label="Passcode" type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoFocus />
        {err && <p className="text-sm text-rose-400">{err}</p>}
        <Btn type="submit">Unlock</Btn>
      </form>
    </main>
  );
}

export default function Page() {
  return <Suspense><Unlock /></Suspense>;
}
