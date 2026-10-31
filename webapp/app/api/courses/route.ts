import { NextResponse } from "next/server";
import { query } from "../../../lib/db";
import { getUser, accessibleCourseIds } from "../../../lib/auth";

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const ids = await accessibleCourseIds(user);
  // Uses the course_material_summary VIEW created in schema.sql
  const courses = await query(
    "SELECT * FROM course_material_summary WHERE course_id = ANY($1::int[]) ORDER BY code",
    [ids]
  );
  return NextResponse.json({ courses });
}
