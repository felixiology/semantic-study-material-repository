"use client";
import { useCallback, useEffect, useState } from "react";
import Nav, { useMe } from "../../components/Nav";

type Course = {
  course_id: number; code: string; course_name: string; faculty_name: string;
  total_documents: string | number; total_chunks: string | number; last_upload: string | null;
};
type Doc = {
  doc_id: number; title: string; file_type: string; status: string;
  chunk_count: number; upload_date: string; uploaded_by: string;
};

export default function Dashboard() {
  const me = useMe();
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState<number | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [fileType, setFileType] = useState("pdf");
  const [text, setText] = useState("");

  const loadCourses = useCallback(async () => {
    const r = await fetch("/api/courses");
    if (!r.ok) return;
    const data = await r.json();
    setCourses(data.courses);
    setCourseId((prev) => prev ?? data.courses[0]?.course_id ?? null);
  }, []);

  const loadDocs = useCallback(async (id: number) => {
    const r = await fetch(`/api/documents?course_id=${id}`);
    if (r.ok) setDocs((await r.json()).documents);
  }, []);

  useEffect(() => { loadCourses(); }, [loadCourses]);
  useEffect(() => { if (courseId) loadDocs(courseId); }, [courseId, loadDocs]);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    setMsg("Uploading and generating embeddings... (the first time can take a minute while the model downloads)");
    setBusy(true);
    const r = await fetch("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ course_id: courseId, title, file_type: fileType, text }),
    });
    const data = await r.json();
    setBusy(false);
    if (!r.ok) { setMsg("Error: " + data.error); return; }
    setMsg(`Uploaded! ${data.chunks} chunks stored, ${data.embedded} embedded for semantic search.`);
    setTitle(""); setText("");
    if (courseId) loadDocs(courseId);
    loadCourses();
  }

  async function embedAll() {
    setBusy(true);
    setMsg("Generating embeddings... (the first time can take a minute while the model downloads)");
    const r = await fetch("/api/embed", { method: "POST" });
    const data = await r.json();
    setBusy(false);
    setMsg(r.ok ? `Done: embedded ${data.embedded} chunks.` : "Error: " + data.error);
  }

  async function remove(id: number) {
    if (!confirm("Delete this document and all its chunks?")) return;
    const r = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    const data = await r.json();
    if (!r.ok) { setMsg("Error: " + data.error); return; }
    if (courseId) loadDocs(courseId);
    loadCourses();
  }

  function readFile(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setText(String(reader.result ?? "")); setFileType("txt"); if (!title) setTitle(file.name.replace(/\.[^.]+$/, "")); };
    reader.readAsText(file);
  }

  const canUpload = me && me.role !== "student";

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <Nav me={me} />
      <main className="max-w-5xl mx-auto p-6 space-y-6">
        <h1 className="text-2xl font-bold">My Courses</h1>

        <div className="grid sm:grid-cols-3 gap-4">
          {courses.map((c) => (
            <button key={c.course_id} onClick={() => setCourseId(c.course_id)}
              className={`text-left bg-white rounded-lg shadow p-4 border-2 ${courseId === c.course_id ? "border-indigo-600" : "border-transparent"}`}>
              <div className="text-xs text-indigo-700 font-semibold">{c.code}</div>
              <div className="font-semibold">{c.course_name}</div>
              <div className="text-sm text-gray-500">{c.faculty_name}</div>
              <div className="text-sm mt-2">{c.total_documents} documents / {c.total_chunks} chunks</div>
            </button>
          ))}
          {courses.length === 0 && <p className="text-gray-500">No courses available for your account.</p>}
        </div>

        <section className="bg-white rounded-lg shadow p-4">
          <h2 className="font-semibold mb-3">Documents</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">Title</th><th>Type</th><th>Status</th><th>Chunks</th><th>Uploaded by</th><th>Date</th>
                {canUpload && <th></th>}
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.doc_id} className="border-b">
                  <td className="py-2">{d.title}</td>
                  <td>{d.file_type}</td>
                  <td>{d.status}</td>
                  <td>{d.chunk_count}</td>
                  <td>{d.uploaded_by}</td>
                  <td>{new Date(d.upload_date).toLocaleDateString()}</td>
                  {canUpload && (
                    <td><button onClick={() => remove(d.doc_id)} className="text-red-600 hover:underline">Delete</button></td>
                  )}
                </tr>
              ))}
              {docs.length === 0 && (
                <tr><td colSpan={7} className="py-4 text-gray-500">No documents in this course yet.</td></tr>
              )}
            </tbody>
          </table>
        </section>

        {canUpload && (
          <section className="bg-white rounded-lg shadow p-4 flex items-center gap-4">
            <button onClick={embedAll} disabled={busy}
                    className="bg-emerald-700 text-white rounded px-4 py-2 disabled:opacity-60">
              Generate missing embeddings
            </button>
            <span className="text-sm text-gray-500">
              Creates the 384-dimension vectors that power semantic search for any chunk that does not have one yet.
            </span>
          </section>
        )}

        {canUpload && (
          <form onSubmit={upload} className="bg-white rounded-lg shadow p-4 space-y-3">
            <h2 className="font-semibold">Upload study material to the selected course</h2>
            <div className="flex gap-3">
              <input className="border rounded px-3 py-2 flex-1" placeholder="Document title"
                     value={title} onChange={(e) => setTitle(e.target.value)} required />
              <select className="border rounded px-3 py-2" value={fileType} onChange={(e) => setFileType(e.target.value)}>
                <option value="pdf">pdf</option><option value="docx">docx</option><option value="txt">txt</option>
              </select>
            </div>
            <input type="file" accept=".txt" onChange={(e) => readFile(e.target.files?.[0])} className="text-sm" />
            <textarea className="border rounded px-3 py-2 w-full h-40"
                      placeholder="Paste the text of the notes here (or pick a .txt file above)"
                      value={text} onChange={(e) => setText(e.target.value)} required />
            <button disabled={busy} className="bg-indigo-700 text-white rounded px-4 py-2 disabled:opacity-60">Upload</button>
          </form>
        )}

        {msg && <p className="text-sm font-medium">{msg}</p>}
      </main>
    </div>
  );
}
