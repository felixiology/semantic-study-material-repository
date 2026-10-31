"use client";
import { useEffect, useState } from "react";
import Nav, { useMe } from "../../components/Nav";

type Course = { course_id: number; code: string; course_name: string };
type Result = { chunk_id: number; title: string; code: string; page_no: number; snippet: string; rank: number };

// Keyword mode marks matches with << >>; we render them as <mark> safely (no raw HTML).
function Highlight({ text }: { text: string }) {
  const parts = text.split(/(<<.*?>>)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("<<") && p.endsWith(">>")
          ? <mark key={i} className="bg-yellow-200">{p.slice(2, -2)}</mark>
          : <span key={i}>{p}</span>
      )}
    </>
  );
}

export default function SearchPage() {
  const me = useMe();
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState("");
  const [mode, setMode] = useState("semantic");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [usedMode, setUsedMode] = useState("semantic");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/courses").then(async (r) => { if (r.ok) setCourses((await r.json()).courses); });
  }, []);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const url = `/api/search?q=${encodeURIComponent(q)}&mode=${mode}${courseId ? `&course_id=${courseId}` : ""}`;
    const r = await fetch(url);
    if (r.ok) {
      const data = await r.json();
      setResults(data.results);
      setUsedMode(data.mode);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <Nav me={me} />
      <main className="max-w-3xl mx-auto p-6 space-y-5">
        <h1 className="text-2xl font-bold">Search study material</h1>
        <form onSubmit={search} className="flex gap-2">
          <input className="border rounded px-3 py-2 flex-1"
                 placeholder="Ask in your own words, e.g. what happens when a page is not in memory?"
                 value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="border rounded px-2" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="semantic">Semantic</option>
            <option value="keyword">Keyword</option>
          </select>
          <select className="border rounded px-2" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">All my courses</option>
            {courses.map((c) => <option key={c.course_id} value={c.course_id}>{c.code}</option>)}
          </select>
          <button className="bg-indigo-700 text-white rounded px-4">{loading ? "..." : "Search"}</button>
        </form>

        {results && (
          <p className="text-xs text-gray-500">
            Mode used: <b>{usedMode === "semantic" ? "semantic (vector similarity)" : "keyword (full-text)"}</b>
          </p>
        )}

        {results && results.length === 0 && (
          <p className="text-gray-500">No matching material found. This search has been logged so faculty can see what students could not find.</p>
        )}

        {results?.map((r) => (
          <div key={r.chunk_id} className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">
              <span className="font-semibold text-indigo-700">{r.code}</span> / {r.title} / page {r.page_no}
              <span className="float-right">
                {usedMode === "semantic" ? `similarity ${(r.rank * 100).toFixed(0)}%` : `score ${r.rank.toFixed(3)}`}
              </span>
            </div>
            <p className="mt-1"><Highlight text={r.snippet} /></p>
          </div>
        ))}
      </main>
    </div>
  );
}
