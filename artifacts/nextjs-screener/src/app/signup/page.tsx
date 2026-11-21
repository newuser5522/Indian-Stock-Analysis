"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api-url";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(apiUrl("/account/signup"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not create account");
      router.push("/login?registered=1");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold">Create your FinTrack account</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your portfolio and watchlist are private to your account.</p>
        </div>
        <label className="block space-y-1 text-sm">
          <span>Name</span>
          <input required maxLength={100} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3" />
        </label>
        <label className="block space-y-1 text-sm">
          <span>Email</span>
          <input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3" />
        </label>
        <label className="block space-y-1 text-sm">
          <span>Password (at least 12 characters)</span>
          <input required minLength={12} maxLength={256} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3" />
        </label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <button type="submit" disabled={busy} className="h-10 w-full rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">
          {busy ? "Creating account…" : "Sign up"}
        </button>
        <p className="text-center text-sm text-muted-foreground">Already have an account? <Link href="/login" className="text-primary hover:underline">Sign in</Link></p>
      </form>
    </main>
  );
}
