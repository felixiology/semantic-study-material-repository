import { NextResponse } from "next/server";
import { query } from "../../../lib/db";
import { getUser, accessibleCourseIds } from "../../../lib/auth";
import { chunkText } from "../../../lib/chunk";

// List documents of one course
export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const courseId = Number(new URL(req.url).searchParams.get("course_id"));
  const ids = await accessibleCourseIds(user);
  if (!ids.includes(courseId)) {
    return NextResponse.json({ error: "No access to this course" }, { status: 403 });
  }

  const documents = await query(
    `SELECT d.doc_id, d.title, d.file_type, d.status, d.chunk_count, d.upload_date,
            u.name AS uploaded_by
     FROM documents d JOIN users u ON u.user_id = d.uploaded_by
     WHERE d.course_id = $1
     ORDER BY d.upload_date DESC`,
    [courseId]
  );
  return NextResponse.json({ documents });
}

// Upload a document: text is chunked, then the upload_document() SQL function
// inserts the document and ALL its chunks in one atomic transaction.
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  if (user.role === "student") {
    return NextResponse.json({ error: "Only faculty or admin can upload" }, { status: 403 });
  }

  const { course_id, title, file_type, text } = await req.json();
  if (!course_id || !String(title ?? "").trim() || !String(text ?? "").trim()) {
    return NextResponse.json({ error: "Course, title and text are required" }, { status: 400 });
  }

  const ids = await accessibleCourseIds(user);
  if (!ids.includes(Number(course_id))) {
    return NextResponse.json({ error: "No access to this course" }, { status: 403 });
  }

  const chunks = chunkText(String(text));
  try {
    const rows = await query<{ doc_id: number }>(
      "SELECT upload_document($1, $2, $3, $4, $5::text[]) AS doc_id",
      [course_id, user.id, String(title).trim(), file_type, chunks]
    );
    return NextResponse.json({ doc_id: rows[0].doc_id, chunks: chunks.length }, { status: 201 });
  } catch (e) {
    const err = e as { code?: string; message: string };
    if (err.code === "23505") {
      return NextResponse.json(
        { error: "A document with this title already exists in this course" }, { status: 409 });
    }
    // Database-level validation (CHECK / NOT NULL / FK) rejected the data
    return NextResponse.json({ error: "Database rejected the upload: " + err.message }, { status: 400 });
  }
}
