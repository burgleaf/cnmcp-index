export const RESOURCE_KINDS = ["mcp", "skill", "plugin"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export const COMPATIBILITY_STATUSES = [
  "native",
  "supported",
  "partial",
  "unsupported",
  "unknown",
] as const;
export type CompatibilityStatus = (typeof COMPATIBILITY_STATUSES)[number];
export type ResourceVisibility = "public" | "unlisted" | "removed";

export type Installation = Readonly<{
  type: "command" | "config" | "link" | "manual";
  label?: string;
  shell?: "bash" | "powershell" | "cmd" | "any";
  command?: string;
  content?: string;
  target?: string;
  url?: string;
  placeholders?: ReadonlyArray<Readonly<{
    name: string;
    description: string;
    secret: boolean;
  }>>;
}>;

export type PlatformCompatibility = Readonly<{
  platform: string;
  status: CompatibilityStatus;
  verifiedAt: string;
  note?: string;
  installations?: ReadonlyArray<Installation>;
}>;

export type Resource = Readonly<{
  schemaVersion: 1;
  id: string;
  kind: ResourceKind;
  pluginScope?: "ai-coding-tool";
  name: string;
  nameEn?: string;
  summary: string;
  summaryEn?: string;
  repository: string;
  homepage?: string;
  documentation?: string;
  license: string;
  author: Readonly<{ name: string; url?: string }>;
  tags: ReadonlyArray<string>;
  compatibility: ReadonlyArray<PlatformCompatibility>;
  createdAt: string;
  updatedAt?: string;
  visibility?: ResourceVisibility;
  featured: boolean;
  logo?: string;
  preview?: string;
  readme?: string;
}>;

export type Platform = Readonly<{
  id: string;
  name: string;
  shortName?: string;
  homepage: string;
  icon: string;
  enabled: boolean;
  sortOrder: number;
}>;

export type Tag = Readonly<{ id: string; name: string }>;

export type ResourceSummaryPlatform = Readonly<{
  id: string;
  status: CompatibilityStatus;
}>;

export type ResourceSummary = Readonly<{
  id: string;
  kind: ResourceKind;
  name: string;
  nameEn?: string;
  summary: string;
  summaryEn?: string;
  authorName: string;
  tags: ReadonlyArray<string>;
  platforms: ReadonlyArray<ResourceSummaryPlatform>;
  logo?: string;
  createdAt: string;
  featured: boolean;
  normalizedSearchText?: string;
}>;

export type CatalogIndexes = Readonly<{
  kinds: Readonly<Record<string, ReadonlyArray<string>>>;
  platforms: Readonly<Record<string, ReadonlyArray<string>>>;
  tags: Readonly<Record<string, ReadonlyArray<string>>>;
}>;

export type GeneratedCatalog = Readonly<{
  schemaVersion: 1;
  resources: ReadonlyArray<Resource>;
  indexes: CatalogIndexes;
  platforms: ReadonlyArray<Platform>;
  tags: ReadonlyArray<Tag>;
}>;

export type ClientCatalog = Readonly<{
  schemaVersion: 1;
  resources: ReadonlyArray<ResourceSummary>;
  indexes: CatalogIndexes;
}>;
