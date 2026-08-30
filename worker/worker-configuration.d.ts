interface WorkerEnv {
  DB: D1Database;
  ALLOWED_ORIGINS: string;
  EVENT_RATE_LIMIT_PER_HOUR: string;
  RECEIPT_RETENTION_SECONDS: string;
  RATE_LIMIT_RETENTION_SECONDS: string;
  HASH_SALT?: string;
}

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
