import type { Resource, ResourceSummary } from "@/lib/catalog-types";

import { EmptyState } from "./empty-state";
import { ResourceCard } from "./resource-card";

type GalleryResource = Resource | ResourceSummary;

export function ResourceGallery({
  resources,
  emptyTitle = "暂无公开资源",
  emptyDescription = "当前目录中还没有可展示的公开资源，请稍后再来。",
  emptyAction,
}: Readonly<{
  resources: ReadonlyArray<GalleryResource>;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
}>) {
  if (resources.length === 0) {
    return <EmptyState action={emptyAction} description={emptyDescription} title={emptyTitle} />;
  }

  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {resources.map((resource) => <ResourceCard key={resource.id} resource={resource} />)}
    </div>
  );
}
