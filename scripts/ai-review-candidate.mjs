import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  REVIEW_PROTOCOL_VERSION,
  buildReviewMessages,
  findCatalogDuplicate,
  parseCandidateIssue,
  renderDuplicateComment,
  renderReviewComment,
  validateReviewReport,
} from "./lib/ai-review.mjs";
import { createDeepSeekClient } from "./lib/deepseek-client.mjs";
import {
  commentHasFingerprint,
  findReviewComment,
  getIssue,
  readCandidateSources,
  upsertReviewComment,
} from "./lib/github-ai-review.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function issueNumber() {
  const value = Number.parseInt(required("AI_REVIEW_ISSUE_NUMBER"), 10);
  if (!Number.isInteger(value) || value < 1) throw new Error("AI_REVIEW_ISSUE_NUMBER must be a positive integer");
  return value;
}

function fingerprint(parts) {
  return createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 20);
}

async function loadCatalog() {
  const payload = JSON.parse(await readFile(path.join(ROOT, "public", "catalog.json"), "utf8"));
  if (!Array.isArray(payload.resources)) throw new Error("public/catalog.json is invalid");
  return payload.resources;
}

export async function runCandidateReview({ fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  const startedAt = Date.now();
  const githubToken = required("GITHUB_TOKEN");
  const catalogRepository = required("GITHUB_REPOSITORY");
  const number = issueNumber();
  const model = process.env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash";
  const issue = await getIssue({ fetchImpl, token: githubToken, repository: catalogRepository, issueNumber: number });
  const candidate = parseCandidateIssue(issue.body);
  const sources = await readCandidateSources({ fetchImpl, token: githubToken, repoFullName: candidate.repoFullName });
  const runFingerprint = fingerprint([
    candidate.candidateId,
    sources.repository.pushedAt ?? "unknown",
    model,
    REVIEW_PROTOCOL_VERSION,
  ]);
  const existing = await findReviewComment({
    fetchImpl,
    token: githubToken,
    repository: catalogRepository,
    issueNumber: number,
  });
  if (commentHasFingerprint(existing, runFingerprint) && process.env.AI_REVIEW_FORCE !== "true") {
    console.info(JSON.stringify({ event: "ai_review", result: "unchanged", candidateId: candidate.candidateId, model }));
    return { action: "unchanged", candidateId: candidate.candidateId };
  }

  const duplicate = findCatalogDuplicate(candidate.repository, await loadCatalog());
  const generatedAt = now().toISOString();
  let body;
  let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  let recommendation = "do_not_list";
  if (duplicate) {
    body = renderDuplicateComment({ candidate, duplicate, fingerprint: runFingerprint, generatedAt });
  } else {
    const client = createDeepSeekClient({
      apiKey: required("DEEPSEEK_API_KEY"),
      baseUrl: process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com",
      model,
      fetchImpl,
      timeoutMs: Number.parseInt(process.env.AI_REVIEW_TIMEOUT_MS || "180000", 10),
      maxTokens: Number.parseInt(process.env.AI_REVIEW_MAX_TOKENS || "6000", 10),
      maxAttempts: Number.parseInt(process.env.AI_REVIEW_MAX_ATTEMPTS || "2", 10),
    });
    const result = await client.complete(buildReviewMessages({ candidate, ...sources }));
    const report = validateReviewReport(result.report);
    if (report.candidateId !== candidate.candidateId || report.repository !== candidate.repository) {
      throw new Error("Invalid review report: candidate identity changed by model");
    }
    usage = result.usage;
    recommendation = report.recommendation;
    body = renderReviewComment({ report, fingerprint: runFingerprint, model, usage, generatedAt });
  }
  const writeResult = await upsertReviewComment({
    fetchImpl,
    token: githubToken,
    repository: catalogRepository,
    issueNumber: number,
    body,
  });
  console.info(
    JSON.stringify({
      event: "ai_review",
      result: writeResult.action,
      candidateId: candidate.candidateId,
      recommendation,
      model: duplicate ? "not_called_duplicate" : model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      durationMs: Date.now() - startedAt,
    }),
  );
  return { action: writeResult.action, candidateId: candidate.candidateId, recommendation, usage };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCandidateReview().catch((error) => {
    console.error(JSON.stringify({ event: "ai_review", result: "failed", error: error instanceof Error ? error.message : "unknown" }));
    process.exitCode = 1;
  });
}
