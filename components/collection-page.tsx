import type { Platform, Resource } from "@/lib/catalog-types";

import { ResourceGallery } from "./resource-gallery";

export function CollectionPage({
  eyebrow,
  title,
  description,
  resources,
  platforms,
}: Readonly<{
  eyebrow: string;
  title: string;
  description: string;
  resources: ReadonlyArray<Resource>;
  platforms: ReadonlyArray<Platform>;
}>) {
  return (
    <main className="mx-auto min-h-[calc(100vh-145px)] max-w-6xl px-6 py-12">
      <header className="mb-8 max-w-3xl">
        <p className="text-sm font-semibold tracking-[0.18em] text-brand">{eyebrow}</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-ink">{title}</h1>
        <p className="mt-4 text-base leading-7 text-slate-600">{description}</p>
      </header>
      <ResourceGallery platforms={platforms} resources={resources} />
    </main>
  );
}
