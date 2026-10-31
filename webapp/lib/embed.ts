import { pipeline } from "@huggingface/transformers";

// Embedding model: all-MiniLM-L6-v2 (384 dimensions), run locally with Transformers.js.
// It is downloaded once on first use and cached on disk; no API key is needed.
type Extractor = (text: string, opts: object) => Promise<{ data: Float32Array }>;

const g = globalThis as unknown as { extractor?: Promise<Extractor> };

function getExtractor(): Promise<Extractor> {
  if (!g.extractor) {
    g.extractor = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
      dtype: "q8",
    }) as unknown as Promise<Extractor>;
  }
  return g.extractor;
}

// Turns text into a 384-number vector. Normalised, so cosine similarity = dot product.
export async function embed(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  const out = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(out.data);
}

// pgvector accepts vectors as the text form "[0.1,0.2,...]"
export function toPgVector(v: number[]): string {
  return JSON.stringify(v);
}
