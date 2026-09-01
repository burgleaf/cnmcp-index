import Link from "next/link";
import tagsRegistry from "@/catalog/tags.json";

const labels = new Map(tagsRegistry.tags.map((tag) => [tag.id, tag.name]));

export function tagLabel(tagId: string): string {
  return labels.get(tagId) ?? tagId;
}

export function TagLink({ tagId, compact = false }: Readonly<{ tagId: string; compact?: boolean }>) {
  return (
    <Link
      className={compact
        ? "rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700 transition hover:bg-blue-50 hover:text-brand"
        : "rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:border-brand hover:text-brand"}
      href={`/tags/${tagId}`}
    >
      {tagLabel(tagId)}
    </Link>
  );
}
