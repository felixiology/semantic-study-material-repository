"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export type Me = { id: number; name: string; email: string; role: string };

// Loads the logged-in user; sends you back to the login page if not logged in.
export function useMe() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    fetch("/api/me").then(async (r) => {
      if (!r.ok) { router.replace("/"); return; }
      setMe((await r.json()).user);
    });
  }, [router]);
  return me;
}

export default function Nav({ me }: { me: Me | null }) {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }
  return (
    <nav className="bg-indigo-700 text-white px-6 py-3 flex items-center gap-6">
      <span className="font-bold">Study Material Repository</span>
      <Link href="/dashboard" className="hover:underline">Dashboard</Link>
      <Link href="/search" className="hover:underline">Search</Link>
      {me && me.role !== "student" && (
        <Link href="/reports" className="hover:underline">Reports</Link>
      )}
      <span className="ml-auto text-sm">
        {me ? `${me.name} (${me.role})` : ""}
      </span>
      <button onClick={logout} className="bg-white text-indigo-700 rounded px-3 py-1 text-sm">
        Logout
      </button>
    </nav>
  );
}
