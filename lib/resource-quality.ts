import { computeResourceQualityCore } from "./resource-quality-core.mjs";
import type { ResourceQuality } from "./catalog-types";

export type ResourceQualityInput = Readonly<{
  stars: number;
  forks: number;
  pushedAt: string | null;
  fetchedAt: string;
  archived: boolean;
  completeness: number;
  featured: boolean;
}>;

export function computeResourceQuality(input: ResourceQualityInput): ResourceQuality {
  return computeResourceQualityCore(input);
}
