"use client";

import { FormEvent, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    setRegistered(new URLSearchParams(window.location.search).get("registered") === "1");
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    const requestedCallback = new URLSearchParams(window.location.search).get("callbackUrl");
    const callbackUrl =
      requestedCallback?.startsWith("/") && !requestedCallback.startsWith("//")
        ? requestedCallback
        : "/";
    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl,
      });
      if (!result || result.error) {
        setError("Sign-in failed. Check your credentials and server configuration.");
        return;
      }
      window.location.assign(result.url ?? callbackUrl);
    } catch {
      setError("Sign-in is unavailable. Check the server configuration and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6 shadow-sm"
      >
        <div>
          <h1 className="text-xl font-semibold">Sign in to FinTrack</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to view your private portfolios and watchlist.
          </p>
        </div>
        {registered && <p role="status" className="text-sm text-green-500">Account created. You can now sign in.</p>}
        <label className="block space-y-1 text-sm">
          <span>Email</span>
          <input
            required
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-10 w-full rounded-md border bg-background px-3"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span>Password</span>
          <input
            required
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-10 w-full rounded-md border bg-background px-3"
          />
        </label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <button
          type="submit"
          disabled={isSubmitting}
          className="h-10 w-full rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
        <div className="flex justify-between text-sm">
          <Link href="/signup" className="text-primary hover:underline">Create account</Link>
          <Link href="/forgot-password" className="text-primary hover:underline">Forgot password?</Link>
        </div>
      </form>
    </main>
  );
}
