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
        className="w-full max-w-sm space-y-4 rounded-xl border border-gray-200 bg-white shadow-sm p-6"
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
        <h1 className="text-xl font-semibold"><span className="mr-1.5 inline-block h-3 w-3 rounded-sm bg-emerald-600 align-[-1px]" />Kobolt</h1>
        <Input label="Passcode" type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoFocus />
        {err && <p className="text-sm text-rose-700">{err}</p>}
        <Btn type="submit">Unlock</Btn>
      </form>
    </main>
  );
}

export default function Page() {
  return <Suspense><Unlock /></Suspense>;
}
