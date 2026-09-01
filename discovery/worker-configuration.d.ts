interface WorkerEnv {
  DB: D1Database;
  DISCOVERY_WORKFLOW: Workflow<DiscoveryCrawlParams>;
  ALLOWED_ORIGINS: string;
  CATALOG_REPOSITORY: string;
  CATALOG_JSON_URL: string;
  PROMOTION_MIN_STARS: string;
  PROMOTION_MAX_ISSUES_PER_CRAWL: string;
  SOURCE_KIND_LIMIT: string;
  PERSIST_PER_KIND_LIMIT: string;
  SEARCH_PAGES_PER_QUERY: string;
  GITHUB_TOKEN?: string;
}

type DiscoveryCrawlParams = {
  crawlDate: string;
  now: number;
};

declare namespace Cloudflare {
  interface Env extends WorkerEnv {
    TEST_MIGRATIONS: D1Migration[];
  }
}

declare module "cloudflare:test" {
  interface ProvidedEnv extends WorkerEnv {
    TEST_MIGRATIONS: D1Migration[];
  }
}
