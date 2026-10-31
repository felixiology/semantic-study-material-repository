import { NextResponse } from "next/server";
import { query } from "../../../lib/db";
import { getUser } from "../../../lib/auth";
import { embed, toPgVector } from "../../../lib/embed";

// Generates embeddings for every chunk that does not have one yet
// (used for the sample data and as a repair tool).
export async function POST() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  if (user.role === "student") {
    return NextResponse.json({ error: "Only faculty or admin can do this" }, { status: 403 });
  }

  try {
    const rows = await query<{ chunk_id: number; content: string }>(
      "SELECT chunk_id, content FROM document_chunks WHERE embedding IS NULL ORDER BY chunk_id"
    );
    let embedded = 0;
    for (const r of rows) {
      const v = await embed(r.content);
      await query("UPDATE document_chunks SET embedding = $1::vector WHERE chunk_id = $2",
        [toPgVector(v), r.chunk_id]);
      embedded++;
    }
    return NextResponse.json({ embedded });
  } catch (e) {
    return NextResponse.json({ error: "Embedding failed: " + (e as Error).message }, { status: 500 });
  }
}
