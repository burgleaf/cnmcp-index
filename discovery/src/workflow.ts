import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";

import { runDiscoveryCrawl } from "./crawl";

export type DiscoveryCrawlParams = {
  crawlDate: string;
  now: number;
};

export class DiscoveryCrawlWorkflow extends WorkflowEntrypoint<WorkerEnv, DiscoveryCrawlParams> {
  async run(event: WorkflowEvent<DiscoveryCrawlParams>, step: WorkflowStep): Promise<{ issued: number; upserted: number }> {
    const now = event.payload.now;
    return await step.do(
      "ingest-score-promote",
      {
        retries: { limit: 2, delay: "60 seconds", backoff: "exponential" },
        timeout: "45 minutes",
      },
      async () => {
        const stats = await runDiscoveryCrawl(this.env, {
          fetch: globalThis.fetch,
          sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
          now,
        });
        return { issued: stats.issued, upserted: stats.upserted };
      },
    );
  }
}
