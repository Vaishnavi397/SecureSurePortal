import { Embeddings } from "@langchain/core/embeddings";
import { config } from "../config/env.js";

// Simplification: a LOCAL hashed bag-of-words embedding (a real LangChain `Embeddings`
// subclass). It needs no API key/network, so the demo is reproducible offline. For
// higher-quality semantic search set EMBEDDINGS_PROVIDER=openai in .env.
const DIM = 768;
const STOP = new Set("a an the of to in on at for and or is are was were be been by with as it this that from has have had not no any per when while than then so if".split(" "));

function tokenize(text) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((w) => w && !STOP.has(w))
    .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w));
}
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function embed(text) {
  const vec = new Array(DIM).fill(0);
  const toks = tokenize(text);
  const add = (term, w) => {
    const h = hash(term);
    vec[h % DIM] += (h & 0x80000000 ? -1 : 1) * w;
  };
  toks.forEach((t, i) => {
    add(t, 1);
    if (i > 0) add(`${toks[i - 1]} ${t}`, 0.5);
  });
  for (let i = 0; i < DIM; i++) vec[i] = Math.sign(vec[i]) * Math.sqrt(Math.abs(vec[i]));
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

export class LocalHashEmbeddings extends Embeddings {
  constructor() {
    super({});
  }
  async embedDocuments(texts) {
    return texts.map(embed);
  }
  async embedQuery(text) {
    return embed(text);
  }
}

export async function getEmbeddings() {
  if (config.ai.embeddings === "openai") {
    const { OpenAIEmbeddings } = await import("@langchain/openai");
    return new OpenAIEmbeddings({ model: "text-embedding-3-small", apiKey: config.ai.openaiKey });
  }
  return new LocalHashEmbeddings();
}
