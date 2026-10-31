import { NextResponse } from "next/server";
import { query } from "../../../lib/db";
import { mongoDb } from "../../../lib/mongo";
import { getUser, accessibleCourseIds } from "../../../lib/auth";

export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const q = (params.get("q") ?? "").trim();
  const courseParam = params.get("course_id");
  if (!q) return NextResponse.json({ results: [] });

  // Only search inside courses this user may access (role-based access)
  let ids = await accessibleCourseIds(user);
  if (courseParam) ids = ids.filter((id) => id === Number(courseParam));

  // Keep only letters/digits so the tsquery is safe; OR the words together.
  const words = (q.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 2);
  let results: unknown[] = [];

  if (words.length > 0 && ids.length > 0) {
    results = await query(
      `SELECT ch.chunk_id, d.title, c.code, ch.page_no,
              ts_headline('english', ch.content, q.tsq,
                'StartSel=<<, StopSel=>>, MaxWords=40, MinWords=15, MaxFragments=1') AS snippet,
              ts_rank(ch.content_tsv, q.tsq)::float AS rank
       FROM document_chunks ch
       JOIN documents d ON d.doc_id = ch.doc_id
       JOIN courses c ON c.course_id = d.course_id
       CROSS JOIN (SELECT to_tsquery('english', $1) AS tsq) q
       WHERE ch.content_tsv @@ q.tsq AND d.course_id = ANY($2::int[])
       ORDER BY rank DESC
       LIMIT 10`,
      [words.join(" | "), ids]
    );
  }

  // Log every search to MongoDB (flexible, write-heavy data). Never break search if Mongo is down.
  try {
    const db = await mongoDb();
    await db.collection("search_logs").insertOne({
      user_id: user.id,
      role: user.role,
      course_id: courseParam ? Number(courseParam) : null,
      query: q,
      result_count: results.length,
      top_score: results.length ? (results[0] as { rank: number }).rank : null,
      searched_at: new Date(),
    });
  } catch (e) {
    console.error("Mongo log failed:", e);
  }

  return NextResponse.json({ results });
}
