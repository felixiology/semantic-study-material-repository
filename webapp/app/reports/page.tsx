"use client";
import { useEffect, useState } from "react";
import Nav, { useMe } from "../../components/Nav";

type Row = Record<string, unknown>;
type Reports = {
  docsPerCourse: Row[]; uploadsByUploader: Row[]; coursesWithManyDocs: Row[]; aboveAverage: Row[];
  topQueries: Row[]; unansweredQueries: Row[]; mongoError: string | null;
};

function Table({ rows }: { rows: Row[] }) {
  if (!rows || rows.length === 0) return <p className="text-sm text-gray-500">No data yet.</p>;
  const cols = Object.keys(rows[0]);
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr>{cols.map((c) => <th key={c} className="text-left px-3 py-2 bg-gray-100 border-b">{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b">
              {cols.map((c) => <td key={c} className="px-3 py-2">{String(r[c] ?? "")}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Card({ title, note, rows }: { title: string; note: string; rows: Row[] }) {
  return (
    <section className="bg-white rounded-lg shadow p-4">
      <h2 className="font-semibold">{title}</h2>
      <p className="text-xs text-gray-500 mb-2">{note}</p>
      <Table rows={rows} />
    </section>
  );
}

export default function ReportsPage() {
  const me = useMe();
  const [data, setData] = useState<Reports | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/reports").then(async (r) => {
      const d = await r.json();
      if (!r.ok) setError(d.error ?? "Could not load reports"); else setData(d);
    });
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <Nav me={me} />
      <main className="max-w-5xl mx-auto p-6 space-y-5">
        <h1 className="text-2xl font-bold">Reports</h1>
        {error && <p className="text-red-600">{error}</p>}
        {data && (
          <>
            <Card title="Documents and chunks per course" note="PostgreSQL: VIEW + JOIN + GROUP BY + ORDER BY" rows={data.docsPerCourse} />
            <Card title="Uploads per uploader" note="PostgreSQL: JOIN + GROUP BY + COUNT" rows={data.uploadsByUploader} />
            <Card title="Courses with 2 or more documents" note="PostgreSQL: GROUP BY + HAVING" rows={data.coursesWithManyDocs} />
            <Card title="Documents with above-average chunk count" note="PostgreSQL: subquery on AVG()" rows={data.aboveAverage} />
            {data.mongoError && <p className="text-red-600 text-sm">MongoDB error: {data.mongoError}</p>}
            <Card title="Most searched queries" note="MongoDB aggregation: $group, $sort, $limit on search_logs" rows={data.topQueries} />
            <Card title="Topics students could not find (0 results)" note="MongoDB aggregation: $match + $group — tells faculty what material is missing" rows={data.unansweredQueries} />
          </>
        )}
      </main>
    </div>
  );
}
