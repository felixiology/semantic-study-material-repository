import { NextResponse } from "next/server";
import { query } from "../../../lib/db";
import { mongoDb } from "../../../lib/mongo";
import { getUser, accessibleCourseIds } from "../../../lib/auth";

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  if (user.role === "student") {
    return NextResponse.json({ error: "Reports are for faculty and admin only" }, { status: 403 });
  }

  const ids = await accessibleCourseIds(user);

  // ---------- SQL reports ----------
  // 1. JOIN + GROUP BY + ORDER BY (through the VIEW)
  const docsPerCourse = await query(
    `SELECT code, course_name, total_documents::int AS documents, total_chunks::int AS chunks
     FROM course_material_summary WHERE course_id = ANY($1::int[])
     ORDER BY total_documents DESC`, [ids]);

  // 2. JOIN + GROUP BY + aggregate
  const uploadsByUploader = await query(
    `SELECT u.name AS uploader, COUNT(d.doc_id)::int AS uploads
     FROM users u JOIN documents d ON d.uploaded_by = u.user_id
     WHERE d.course_id = ANY($1::int[])
     GROUP BY u.name ORDER BY uploads DESC`, [ids]);

  // 3. HAVING
  const coursesWithManyDocs = await query(
    `SELECT c.code, COUNT(d.doc_id)::int AS documents
     FROM courses c JOIN documents d ON d.course_id = c.course_id
     WHERE c.course_id = ANY($1::int[])
     GROUP BY c.code HAVING COUNT(d.doc_id) >= 2
     ORDER BY documents DESC`, [ids]);

  // 4. Subquery
  const aboveAverage = await query(
    `SELECT title, chunk_count
     FROM documents
     WHERE chunk_count > (SELECT AVG(chunk_count) FROM documents)
       AND course_id = ANY($1::int[])
     ORDER BY chunk_count DESC`, [ids]);

  // ---------- MongoDB aggregation reports (from search_logs) ----------
  let topQueries: unknown[] = [];
  let unansweredQueries: unknown[] = [];
  let mongoError: string | null = null;
  try {
    const col = (await mongoDb()).collection("search_logs");

    topQueries = await col.aggregate([
      { $group: { _id: { $toLower: "$query" }, searches: { $sum: 1 }, avgResults: { $avg: "$result_count" } } },
      { $sort: { searches: -1 } },
      { $limit: 10 },
      { $project: { _id: 0, query: "$_id", searches: 1, avg_results: { $round: ["$avgResults", 1] } } },
    ]).toArray();

    // "Topics students can't find": searches that returned nothing
    unansweredQueries = await col.aggregate([
      { $match: { result_count: 0 } },
      { $group: { _id: { $toLower: "$query" }, times_searched: { $sum: 1 }, last_searched: { $max: "$searched_at" } } },
      { $sort: { times_searched: -1 } },
      { $limit: 10 },
      { $project: { _id: 0, query: "$_id", times_searched: 1, last_searched: 1 } },
    ]).toArray();
  } catch (e) {
    mongoError = (e as Error).message;
  }

  return NextResponse.json({
    docsPerCourse, uploadsByUploader, coursesWithManyDocs, aboveAverage,
    topQueries, unansweredQueries, mongoError,
  });
}
