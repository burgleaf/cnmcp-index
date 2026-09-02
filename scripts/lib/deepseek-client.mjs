const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-pro";

function sanitizedError(message) {
  return new Error(`DeepSeek request failed: ${message}`);
}

export function createDeepSeekClient({
  apiKey,
  baseUrl = DEFAULT_BASE_URL,
  model = DEFAULT_MODEL,
  fetchImpl = globalThis.fetch,
  timeoutMs = 60_000,
  maxTokens = 3_000,
  maxAttempts = 1,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is required");
  const normalizedBaseUrl = String(baseUrl).replace(/\/+$/, "");
  if (normalizedBaseUrl !== DEFAULT_BASE_URL) throw new Error("DEEPSEEK_BASE_URL must be https://api.deepseek.com");
  if (!/^deepseek-v4-(?:pro|flash)$/.test(model)) throw new Error("DEEPSEEK_MODEL must be a supported DeepSeek V4 text model");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) throw new Error("timeoutMs must be between 1000 and 120000");
  if (!Number.isInteger(maxTokens) || maxTokens < 500 || maxTokens > 8_000) throw new Error("maxTokens must be between 500 and 8000");
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) throw new Error("maxAttempts must be between 1 and 3");

  return {
    model,
    async complete(messages) {
      let lastError;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetchImpl(`${normalizedBaseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              messages,
              response_format: { type: "json_object" },
              thinking: { type: "enabled" },
              reasoning_effort: "high",
              max_tokens: maxTokens,
              stream: false,
            }),
            signal: controller.signal,
          });
          if (!response.ok) {
            const retryable = response.status === 429 || response.status >= 500;
            if (retryable && attempt < maxAttempts) {
              await sleep(500 * 2 ** (attempt - 1));
              continue;
            }
            throw sanitizedError(`HTTP ${response.status}`);
          }
          const payload = await response.json();
          const choice = payload?.choices?.[0];
          if (choice?.finish_reason === "length") throw sanitizedError("JSON output was truncated");
          const content = choice?.message?.content;
          if (typeof content !== "string" || !content.trim()) throw sanitizedError("empty model output");
          let report;
          try {
            report = JSON.parse(content);
          } catch {
            throw sanitizedError("invalid JSON output");
          }
          const usage = payload?.usage ?? {};
          return {
            report,
            usage: {
              inputTokens: Number.isFinite(usage.prompt_tokens) ? usage.prompt_tokens : 0,
              outputTokens: Number.isFinite(usage.completion_tokens) ? usage.completion_tokens : 0,
              totalTokens: Number.isFinite(usage.total_tokens) ? usage.total_tokens : 0,
            },
          };
        } catch (error) {
          lastError =
            error?.name === "AbortError"
              ? sanitizedError("timeout")
              : error instanceof Error && error.message.startsWith("DeepSeek request failed:")
                ? error
                : sanitizedError("network error");
          if (attempt < maxAttempts && !String(lastError?.message).includes("HTTP 4")) {
            await sleep(500 * 2 ** (attempt - 1));
            continue;
          }
          throw lastError instanceof Error ? lastError : sanitizedError("unknown error");
        } finally {
          clearTimeout(timer);
        }
      }
      throw lastError instanceof Error ? lastError : sanitizedError("unknown error");
    },
  };
}
