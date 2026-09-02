import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <Link className="text-lg font-semibold text-ink" href="/">
          CNMCP <span className="font-normal text-slate-500">AI扩展社区</span>
        </Link>
        <nav aria-label="主导航" className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
          <Link className="whitespace-nowrap transition hover:text-brand" href="/">首页</Link>
          <Link className="whitespace-nowrap transition hover:text-brand" href="/resources">浏览资源</Link>
          <Link className="whitespace-nowrap transition hover:text-brand" href="/topics">使用场景</Link>
          <Link className="whitespace-nowrap transition hover:text-brand" href="/submit">投稿</Link>
        </nav>
      </div>
    </header>
  );
}
