import { config } from "../config/env.js";
import { mockGenerate } from "./mockLLM.js";

let modelPromise = null;

async function createModel() {
  const { provider, model, anthropicKey, openaiKey } = config.ai;
  if (provider === "anthropic") {
    if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY is not set");
    const { ChatAnthropic } = await import("@langchain/anthropic");
    return new ChatAnthropic({ model, temperature: 0, maxTokens: 1200, apiKey: anthropicKey, maxRetries: 1 });
  }
  if (provider === "openai") {
    if (!openaiKey) throw new Error("OPENAI_API_KEY is not set");
    const { ChatOpenAI } = await import("@langchain/openai");
    return new ChatOpenAI({ model, temperature: 0, apiKey: openaiKey, maxRetries: 1 });
  }
  if (provider === "openai-compatible") {
    if (!config.ai.baseUrl) throw new Error("LLM_BASE_URL is not set");
    const { ChatOpenAI } = await import("@langchain/openai");
    return new ChatOpenAI({ model, temperature: 0, maxTokens: 3000, apiKey: config.ai.compatKey || "none", maxRetries: 1, configuration: { baseURL: config.ai.baseUrl }});
  }
  throw new Error(`Unsupported LLM_PROVIDER: ${provider}`);
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error("LLM request timed out"), { code: "AI_TIMEOUT" })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export const llmInfo = () => ({ provider: config.ai.provider, model: config.ai.model });

// Returns the raw text answer of the model.
export async function callLLM({ prompt, claim, chunks }) {
  if (config.ai.provider === "mock") return mockGenerate({ claim, chunks });
  if (!modelPromise) modelPromise = createModel().catch((e) => { modelPromise = null; throw e; });
  const model = await modelPromise;
  const res = await withTimeout(model.invoke(prompt), config.ai.timeoutMs);
  return Array.isArray(res.content) ? res.content.map((p) => p.text || "").join("") : String(res.content);
}
