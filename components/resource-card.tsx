import Link from "next/link";

import type {
  CompatibilityStatus,
  Platform,
  PlatformCompatibility,
  ResourceKind,
  ResourceSummaryPlatform,
} from "@/lib/catalog-types";

import { PlatformBadge } from "./platform-badge";
import { ResourceStats } from "./resource-stats";

const KIND_LABELS: Readonly<Record<ResourceKind, string>> = {
  mcp: "MCP",
  skill: "Skill",
  plugin: "AI 编程插件",
};

type CardResource = Readonly<{
  id: string;
  kind: ResourceKind;
  name: string;
  summary: string;
  tags: ReadonlyArray<string>;
  createdAt: string;
  featured: boolean;
  compatibility?: ReadonlyArray<PlatformCompatibility>;
  platforms?: ReadonlyArray<ResourceSummaryPlatform>;
}>;

function getCompatibility(
  resource: CardResource,
  platformId: string,
): Readonly<{ status: CompatibilityStatus; verifiedAt?: string }> {
  const full = resource.compatibility?.find((entry) => entry.platform === platformId);
  if (full) return { status: full.status, verifiedAt: full.verifiedAt };
  const summary = resource.platforms?.find((entry) => entry.id === platformId);
  return summary ? { status: summary.status } : { status: "unknown" };
}

export function ResourceCard({
  resource,
  platforms,
}: Readonly<{
  resource: CardResource;
  platforms: ReadonlyArray<Platform>;
}>) {
  return (
    <article className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-brand">
          {KIND_LABELS[resource.kind]}
        </span>
        {resource.featured ? (
          <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">精选</span>
        ) : null}
      </div>
      <h3 className="mt-4 text-xl font-semibold text-ink">
        <Link className="rounded-sm hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2" href={`/resources/${resource.id}`}>
          {resource.name}
        </Link>
      </h3>
      <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{resource.summary}</p>
      <ul aria-label="资源标签" className="mt-4 flex flex-wrap gap-2">
        {resource.tags.slice(0, 4).map((tag) => (
          <li className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700" key={tag}>#{tag}</li>
        ))}
      </ul>
      <div aria-label="平台兼容状态" className="mt-4 flex flex-wrap gap-2">
        {platforms.filter((platform) => platform.enabled).map((platform) => {
          const compatibility = getCompatibility(resource, platform.id);
          return (
            <PlatformBadge
              key={platform.id}
              platformName={platform.name}
              status={compatibility.status}
              verifiedAt={compatibility.verifiedAt}
            />
          );
        })}
      </div>
      <div className="mt-5 border-t border-slate-100 pt-4 text-xs text-slate-500">
        <p>收录日期：{resource.createdAt}</p>
        <div className="mt-2"><ResourceStats resourceId={resource.id} /></div>
      </div>
    </article>
  );
}
