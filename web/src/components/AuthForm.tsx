"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";

type User = { subscriptionActive: boolean };

async function goToCheckoutOrDashboard(user: User) {
  if (user.subscriptionActive) {
    window.location.href = "/dashboard";
    return;
  }
  const { url } = await api<{ url: string }>("/api/billing/checkout", { method: "POST" });
  window.location.href = url;
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const form = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    try {
      const { user } = await api<{ user: User }>(`/api/auth/${mode}`, {
        body: mode === "signup" ? { ...form, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } : form,
      });
      await goToCheckoutOrDashboard(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="card auth-card stack" onSubmit={submit}>
        <h2>{mode === "signup" ? "Create your account" : "Welcome back"}</h2>
        {mode === "signup" && (
          <>
            <label>Your name<input name="name" required autoComplete="name" /></label>
            <label>Business name<input name="businessName" required autoComplete="organization" /></label>
          </>
        )}
        <label>Email<input name="email" type="email" required autoComplete="email" /></label>
        <label>
          Password
          <input name="password" type="password" required minLength={mode === "signup" ? 8 : undefined} autoComplete={mode === "signup" ? "new-password" : "current-password"} />
        </label>
        {error && <p className="alert alert-error" role="alert" style={{ margin: 0 }}>{error}</p>}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Please wait…" : mode === "signup" ? "Continue to payment — $50/month" : "Log in"}
        </button>
        <p className="muted small" style={{ margin: 0, textAlign: "center" }}>
          {mode === "signup" ? (
            <>Already have an account? <Link href="/login">Log in</Link></>
          ) : (
            <>New here? <Link href="/signup">Create an account</Link></>
          )}
        </p>
      </form>
    </div>
  );
}
