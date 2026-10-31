import { NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { getUser, accessibleCourseIds } from "../../../../lib/auth";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  if (user.role === "student") {
    return NextResponse.json({ error: "Only faculty or admin can delete" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const found = await query<{ course_id: number }>(
    "SELECT course_id FROM documents WHERE doc_id = $1", [id]);
  if (!found[0]) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const ids = await accessibleCourseIds(user);
  if (!ids.includes(found[0].course_id)) {
    return NextResponse.json({ error: "No access to this course" }, { status: 403 });
  }

  // Chunks are removed by ON DELETE CASCADE; the audit trigger logs the deletion.
  await query("DELETE FROM documents WHERE doc_id = $1", [id]);
  return NextResponse.json({ ok: true });
}
