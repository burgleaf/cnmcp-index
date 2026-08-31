import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-slate-200 bg-white/95">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <Link className="text-lg font-semibold text-ink" href="/">
          CNMCP AI 扩展社区
        </Link>
        <nav aria-label="主导航" className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
          <Link className="transition hover:text-brand" href="/">首页</Link>
          <Link className="transition hover:text-brand" href="/discover">发现</Link>
          <Link className="transition hover:text-brand" href="/resources">资源目录</Link>
          <Link className="transition hover:text-brand" href="/category/mcp">MCP</Link>
          <Link className="transition hover:text-brand" href="/category/skill">Skill</Link>
          <Link className="transition hover:text-brand" href="/category/plugin">插件</Link>
          <Link className="transition hover:text-brand" href="/submit">投稿</Link>
        </nav>
      </div>
    </header>
  );
}
