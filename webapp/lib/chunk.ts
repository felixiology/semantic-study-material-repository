// Splits raw text into chunks of roughly `max` characters, breaking at sentence ends.
export function chunkText(text: string, max = 600): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    const sentences = p.match(/[^.!?]+[.!?]*\s*/g) ?? [p];
    for (const s of sentences) {
      if ((current + s).length > max && current.trim()) {
        chunks.push(current.trim());
        current = "";
      }
      current += s;
    }
    current += " ";
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
