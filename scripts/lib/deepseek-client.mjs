const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-flash";

class DeepSeekRequestError extends Error {
  constructor(message, { retryable = false } = {}) {
    super(`DeepSeek request failed: ${message}`);
    this.name = "DeepSeekRequestError";
    this.retryable = retryable;
  }
}

function sanitizedError(message, options) {
  return new DeepSeekRequestError(message, options);
}

export function createDeepSeekClient({
  apiKey,
  baseUrl = DEFAULT_BASE_URL,
  model = DEFAULT_MODEL,
  fetchImpl = globalThis.fetch,
  timeoutMs = 180_000,
  maxTokens = 6_000,
  maxAttempts = 2,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is required");
  const normalizedBaseUrl = String(baseUrl).replace(/\/+$/, "");
  if (normalizedBaseUrl !== DEFAULT_BASE_URL) throw new Error("DEEPSEEK_BASE_URL must be https://api.deepseek.com");
  if (!/^deepseek-v4-(?:pro|flash)$/.test(model)) throw new Error("DEEPSEEK_MODEL must be a supported DeepSeek V4 text model");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 180_000) throw new Error("timeoutMs must be between 1000 and 180000");
  if (!Number.isInteger(maxTokens) || maxTokens < 500 || maxTokens > 8_000) throw new Error("maxTokens must be between 500 and 8000");
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 2) throw new Error("maxAttempts must be between 1 and 2");

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
              thinking: { type: "disabled" },
              max_tokens: maxTokens,
              stream: false,
            }),
            signal: controller.signal,
          });
          if (!response.ok) {
            const retryable = response.status === 429 || response.status >= 500;
            throw sanitizedError(`HTTP ${response.status}`, { retryable });
          }
          const responseBody = await response.text();
          let payload;
          try {
            payload = JSON.parse(responseBody);
          } catch {
            throw sanitizedError("invalid JSON response");
          }
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
              ? sanitizedError("timeout", { retryable: true })
              : error instanceof DeepSeekRequestError
                ? error
                : sanitizedError("network error", { retryable: true });
          if (attempt < maxAttempts && lastError.retryable) {
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
