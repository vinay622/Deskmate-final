import { Pinecone } from "@pinecone-database/pinecone";

let _pinecone: Pinecone | null = null;

function getPineconeClient(): Pinecone {
  if (!_pinecone) {
    const apiKey = import.meta.env.PINECONE_API_KEY;
    if (!apiKey) throw new Error("PINECONE_API_KEY is not set");
    _pinecone = new Pinecone({ apiKey });
  }
  return _pinecone;
}

function getPineconeIndex() {
  const pc = getPineconeClient();
  const indexName = import.meta.env.PINECONE_INDEX;
  if (!indexName) throw new Error("PINECONE_INDEX is not set");
  return pc.index(indexName);
}

// Pinecone Inference — no external embedding API key needed
export const PINECONE_EMBED_MODEL = "multilingual-e5-large";

export async function generateEmbeddings(
  texts: string[],
  inputType: "passage" | "query" = "passage"
): Promise<number[][]> {
  const pc = getPineconeClient();
  const result = await pc.inference.embed({
    model: PINECONE_EMBED_MODEL,
    inputs: texts,
    parameters: { inputType, truncate: "END" },
  });

  // SDK v7: EmbeddingsList.data is optional — the list may be iterable directly
  const items: any[] = result.data
    ? result.data
    : Array.from(result as any);

  if (items.length === 0 && texts.length > 0) {
    throw new Error(
      `Pinecone Inference returned no embeddings. Raw response: ${JSON.stringify(result)}`
    );
  }

  return items.map((e: any, i: number) => {
    const values = e.values ?? e.embedding;
    if (!Array.isArray(values)) {
      throw new Error(
        `Unexpected embedding shape at index ${i}: ${JSON.stringify(e)}`
      );
    }
    return values as number[];
  });
}

export async function upsertDocumentChunks(
  docId: string,
  docName: string,
  docCategory: string,
  chunks: Array<{ content: string; chunkIndex: number }>,
  embeddings: number[][],
  collegeName: string
): Promise<void> {
  const index = getPineconeIndex();

  // Process in batches to avoid loading all vectors in memory at once
  const BATCH_SIZE = 100;
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batchChunks = chunks.slice(i, i + BATCH_SIZE);
    const batchEmbeddings = embeddings.slice(i, i + BATCH_SIZE);

    const vectors = batchChunks.map((chunk, idx) => ({
      id: `${docId}_${chunk.chunkIndex}`,
      values: batchEmbeddings[idx],
      metadata: {
        documentId: docId,
        documentName: docName,
        documentCategory: docCategory,
        collegeName,
        content: chunk.content,
        chunkIndex: chunk.chunkIndex,
      },
    }));

    await index.upsert({ records: vectors });
    console.log(`[pinecone] Upserted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(chunks.length / BATCH_SIZE)}`);
  }
}

export async function deleteDocumentVectors(docId: string): Promise<void> {
  const index = getPineconeIndex();

  // Delete all vectors whose metadata.documentId matches this document
  await index.deleteMany({
    filter: { documentId: { $eq: docId } },
  });
}

export async function queryIndex(
  queryEmbedding: number[],
  topK: number = 5,
  scoreThreshold: number = 0.5,
  collegeName?: string
): Promise<Array<{
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  similarity: number;
  document_name: string;
  document_category: string;
}>> {
  const index = getPineconeIndex();

  const filter = collegeName
    ? { collegeName: { $eq: collegeName } }
    : undefined;

  const results = await index.query({
    vector: queryEmbedding,
    topK,
    includeMetadata: true,
    filter,
  });
  return (results.matches ?? [])
    .filter((m) => (m.score ?? 0) >= scoreThreshold)
    .map((m) => ({
      id: m.id,
      document_id: (m.metadata?.documentId as string) ?? "",
      chunk_index: (m.metadata?.chunkIndex as number) ?? 0,
      content: (m.metadata?.content as string) ?? "",
      similarity: m.score ?? 0,
      document_name: (m.metadata?.documentName as string) ?? "",
      document_category: (m.metadata?.documentCategory as string) ?? "",
    }));
}

// ─── Semantic Cache ──────────────────────────────────────────

export async function upsertSemanticCache(
  query: string,
  embedding: number[],
  answer: string,
  collegeName: string
): Promise<void> {
  try {
    const pc = getPineconeClient();
    const indexName = import.meta.env.PINECONE_INDEX;
    if (!indexName) return;
    const index = pc.index(indexName).namespace('semantic_cache');
    
    // Hash the query roughly or just use crypto.randomUUID (using crypto requires 'crypto' import, so let's just use Date.now() + Math.random() for simplicity, or native crypto if available)
    const id = "cache_" + Date.now().toString() + "_" + Math.floor(Math.random() * 1000000);
    
    await index.upsert({ records: [{
      id,
      values: embedding,
      metadata: { query, answer, collegeName },
    }]});
    console.log(`[semantic-cache] Upserted cached response for: "${query}"`);
  } catch (err) {
    console.error("[semantic-cache] Upsert error:", err);
  }
}

export async function querySemanticCache(
  embedding: number[],
  collegeName: string,
  threshold: number = 0.98
): Promise<string | null> {
  try {
    const pc = getPineconeClient();
    const indexName = import.meta.env.PINECONE_INDEX;
    if (!indexName) return null;
    const index = pc.index(indexName).namespace('semantic_cache');
    
    const results = await index.query({
      vector: embedding,
      topK: 1,
      includeMetadata: true,
      filter: { collegeName: { $eq: collegeName } }
    });
    
    if (results.matches && results.matches.length > 0) {
      const match = results.matches[0];
      if (match.score && match.score >= threshold && match.metadata?.answer) {
        console.log(`[semantic-cache] Hit! Score: ${match.score}`);
        return match.metadata.answer as string;
      }
    }
    return null;
  } catch (err) {
    console.error("[semantic-cache] Query error:", err);
    return null;
  }
}

