import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { query } from "../../../../lib/db";
import { signToken, type Role } from "../../../../lib/auth";

export async function POST(req: Request) {
  const { email, password } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const rows = await query<{
    user_id: number; name: string; email: string; password_hash: string; role: Role;
  }>(
    "SELECT user_id, name, email, password_hash, role FROM users WHERE email = $1",
    [String(email).trim().toLowerCase()]
  );
  const u = rows[0];

  // Passwords are stored as bcrypt hashes, never in plain text.
  if (!u || !(await bcrypt.compare(String(password), u.password_hash))) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  await query("UPDATE users SET last_login = NOW() WHERE user_id = $1", [u.user_id]);

  const token = signToken({ id: u.user_id, name: u.name, email: u.email, role: u.role });
  const res = NextResponse.json({ user: { name: u.name, role: u.role } });
  res.cookies.set("token", token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 8 * 3600 });
  return res;
}
