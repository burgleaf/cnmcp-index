import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";

import { ingestCandidates, persistSnapshot, promoteNewCandidates } from "./crawl";

export type DiscoveryCrawlParams = {
  crawlDate: string;
  now: number;
};

function crawlRuntime(now: number) {
  return {
    fetch: globalThis.fetch,
    sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    now,
  };
}

export class DiscoveryCrawlWorkflow extends WorkflowEntrypoint<WorkerEnv, DiscoveryCrawlParams> {
  async run(
    event: WorkflowEvent<DiscoveryCrawlParams>,
    step: WorkflowStep,
  ): Promise<{ issued: number; upserted: number }> {
    const runtime = crawlRuntime(event.payload.now);
    const ingested = await step.do(
      "ingest",
      { retries: { limit: 2, delay: "60 seconds", backoff: "exponential" }, timeout: "20 minutes" },
      async () => ingestCandidates(this.env, runtime),
    );
    const persisted = await step.do(
      "persist",
      { retries: { limit: 2, delay: "15 seconds", backoff: "exponential" }, timeout: "2 minutes" },
      async () => persistSnapshot(this.env, runtime, ingested.candidates, ingested.stats),
    );
    const issued = await step.do(
      "promote",
      { retries: { limit: 2, delay: "30 seconds", backoff: "exponential" }, timeout: "10 minutes" },
      async () => promoteNewCandidates(this.env, runtime),
    );
    return { issued, upserted: persisted.upserted };
  }
}
