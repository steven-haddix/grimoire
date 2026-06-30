import { openai } from "@ai-sdk/openai";
import { embed, embedMany } from "ai";

// OpenAI `text-embedding-3-small` returns 1536-dim vectors (see
// EMBEDDING_DIMENSIONS in the db schema) and accepts up to ~8191 tokens of
// input. We cap embedding input well under that; the full text is still stored
// on the chunk, only the embedding input is truncated.
export const EMBEDDING_PROVIDER = "openai";
export const EMBEDDING_MODEL = "text-embedding-3-small";
const MAX_EMBEDDING_INPUT_CHARS = 24_000;

const model = openai.textEmbeddingModel(EMBEDDING_MODEL);

export type EmbeddingMeta = {
  embeddingProvider: string | null;
  embeddingModel: string | null;
  embeddingDimensions: number | null;
};

/**
 * Provenance to store alongside an embedding so a future model/provider switch
 * can re-embed accurately and search can avoid comparing vectors from different
 * spaces. Returns all-null for a missing embedding (keyword-only row).
 */
export function embeddingMeta(embedding: number[] | null): EmbeddingMeta {
  if (!embedding) {
    return {
      embeddingProvider: null,
      embeddingModel: null,
      embeddingDimensions: null,
    };
  }
  return {
    embeddingProvider: EMBEDDING_PROVIDER,
    embeddingModel: EMBEDDING_MODEL,
    embeddingDimensions: embedding.length,
  };
}

export function embeddingsEnabled(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function prepare(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > MAX_EMBEDDING_INPUT_CHARS
    ? trimmed.slice(0, MAX_EMBEDDING_INPUT_CHARS)
    : trimmed;
}

/**
 * Embed a single string. Returns `null` (rather than throwing) when embeddings
 * are unavailable or the call fails, so callers can degrade to keyword-only
 * search instead of erroring.
 */
export async function embedText(text: string): Promise<number[] | null> {
  if (!embeddingsEnabled()) return null;
  const value = prepare(text);
  if (!value) return null;
  try {
    const { embedding } = await embed({ model, value });
    return embedding;
  } catch (error) {
    console.error("embedText failed", error);
    return null;
  }
}

/**
 * Embed many strings in one batched request. Returns one entry per input in the
 * same order; entries are `null` when embeddings are unavailable or the call
 * fails.
 */
export async function embedTexts(
  texts: string[],
): Promise<(number[] | null)[]> {
  if (!texts.length) return [];
  if (!embeddingsEnabled()) return texts.map(() => null);
  const values = texts.map(prepare);
  try {
    const { embeddings } = await embedMany({ model, values });
    return embeddings;
  } catch (error) {
    console.error("embedTexts failed", error);
    return texts.map(() => null);
  }
}
