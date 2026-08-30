import type { ReactNode } from "react";

export function EmptyState({
  title = "暂无资源",
  description = "当前没有符合条件的公开资源。",
  action,
}: Readonly<{
  title?: string;
  description?: string;
  action?: ReactNode;
}>) {
  return (
    <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center" role="status">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </section>
  );
}
