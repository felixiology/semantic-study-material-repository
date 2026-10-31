"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await r.json();
    setLoading(false);
    if (!r.ok) { setError(data.error ?? "Login failed"); return; }
    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex items-center justify-center p-6">
      <form onSubmit={submit} className="bg-white shadow rounded-lg p-8 w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold text-indigo-700">Study Material Repository</h1>
        <p className="text-sm text-gray-500">Sign in to search and manage course materials.</p>
        <input className="border rounded w-full px-3 py-2" placeholder="Email" type="email"
               value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="border rounded w-full px-3 py-2" placeholder="Password" type="password"
               value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button disabled={loading}
                className="bg-indigo-700 text-white rounded w-full py-2 disabled:opacity-60">
          {loading ? "Signing in..." : "Sign in"}
        </button>
        <p className="text-xs text-gray-500">
          Demo accounts (password <b>password123</b>): admin@pes.edu, rao@pes.edu (faculty), poorvi@pes.edu (student)
        </p>
      </form>
    </div>
  );
}
