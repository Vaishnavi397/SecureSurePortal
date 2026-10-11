import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { getEmbeddings } from "./embeddings.js";
import { logger } from "../utils/logger.js";

const KB_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "knowledge");
const FILE_CATEGORY = { "motor.md": "MOTOR", "health.md": "HEALTH", "travel.md": "TRAVEL", "property.md": "PROPERTY", "general.md": "GENERAL" };

let storePromise = null;
let chunkCount = 0;

// Chunking strategy: one chunk per policy clause ("## XXX-n Title"); clauses longer than
// 700 chars are further split with RecursiveCharacterTextSplitter (heading is repeated).
async function loadChunks() {
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 700, chunkOverlap: 80 });
  const docs = [];
  for (const [file, category] of Object.entries(FILE_CATEGORY)) {
    const raw = await fs.readFile(path.join(KB_DIR, file), "utf8");
    const sections = raw.split(/^## /m).map((s) => s.trim()).filter(Boolean);
    for (const section of sections) {
      const [heading, ...rest] = section.split("\n");
      const clauseId = heading.split(" ")[0];
      const body = rest.join("\n").trim();
      const parts = section.length > 700 ? await splitter.splitText(body) : [body];
      parts.forEach((part, i) => {
        docs.push(
          new Document({
            pageContent: `${heading}\n${part}`,
            metadata: { source: file, category, clauseId, chunkId: `${clauseId}#${i}` },
          })
        );
      });
    }
  }
  return docs;
}

async function buildStore() {
  const docs = await loadChunks();
  chunkCount = docs.length;
  const store = await MemoryVectorStore.fromDocuments(docs, await getEmbeddings());
  logger.info("rag_index_built", { chunks: docs.length });
  return store;
}

export function initRag() {
  if (!storePromise) {
    storePromise = buildStore().catch((err) => {
      storePromise = null; // allow retry on next call
      throw err;
    });
  }
  return storePromise;
}

export const ragStatus = () => (storePromise ? { ready: chunkCount > 0, chunks: chunkCount } : { ready: false, chunks: 0 });

/**
 * Retrieval strategy from the workbook: similarity search (for scores) + MMR (for diverse
 * chunks). Results are limited to the claim type's policy plus the GENERAL guidelines.
 */
export async function search(query, { claimType, k = 5, fetchK = 12 } = {}) {
  const store = await initRag();
  const filter = (doc) => !claimType || doc.metadata.category === claimType || doc.metadata.category === "GENERAL";

  const scored = await store.similaritySearchWithScore(query, fetchK, filter);
  const scoreById = new Map(scored.map(([d, s]) => [d.metadata.chunkId, s]));

  let docs;
  try {
    docs = await store.maxMarginalRelevanceSearch(query, { k, fetchK, lambda: 0.6, filter });
  } catch (err) {
    logger.warn("mmr_failed_using_similarity", { err: err.message });
    docs = scored.slice(0, k).map(([d]) => d);
  }
  return docs.map((d) => ({
    chunkId: d.metadata.chunkId,
    clauseId: d.metadata.clauseId,
    source: d.metadata.source,
    category: d.metadata.category,
    text: d.pageContent,
    score: Number((scoreById.get(d.metadata.chunkId) ?? 0).toFixed(3)),
  }));
}
