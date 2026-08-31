import type { DiscoveryKind } from "./classify";

export type CandidateRecord = {
  repoFullName: string;
  htmlUrl: string;
  name: string;
  description: string;
  stars: number;
  forks: number;
  language: string | null;
  license: string | null;
  topics: string[];
  kind: DiscoveryKind;
  inferredPlatforms: string[];
  score: number;
  pushedAt: string | null;
  sources: string[];
};

export type StoredCandidate = CandidateRecord & {
  catalogId: string | null;
  promotionStatus: "none" | "issued" | "skipped";
  issueNumber: number | null;
  firstSeenAt: number;
  lastCrawledAt: number;
};

export type CrawlStats = {
  registry: number;
  github: number;
  upserted: number;
  catalogMatched: number;
  issued: number;
};
