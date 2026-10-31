import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { query } from "./db";

export type Role = "admin" | "faculty" | "student";
export type SessionUser = { id: number; name: string; email: string; role: Role };

export function signToken(u: SessionUser): string {
  return jwt.sign(u, process.env.JWT_SECRET as string, { expiresIn: "8h" });
}

// Reads the login cookie and returns the logged-in user (or null).
export async function getUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get("token")?.value;
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET as string) as unknown as SessionUser;
  } catch {
    return null;
  }
}

// Role-based access: which courses can this user see?
//   admin   -> all courses
//   faculty -> courses they teach
//   student -> courses they are enrolled in
export async function accessibleCourseIds(u: SessionUser): Promise<number[]> {
  let rows: { course_id: number }[];
  if (u.role === "admin") {
    rows = await query<{ course_id: number }>("SELECT course_id FROM courses");
  } else if (u.role === "faculty") {
    rows = await query<{ course_id: number }>(
      "SELECT course_id FROM courses WHERE faculty_id = $1", [u.id]);
  } else {
    rows = await query<{ course_id: number }>(
      "SELECT course_id FROM enrollments WHERE student_id = $1", [u.id]);
  }
  return rows.map((r) => r.course_id);
}
