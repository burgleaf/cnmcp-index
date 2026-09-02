import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-8 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getUTCFullYear()} CNMCP AI扩展社区</p>
        <nav aria-label="页脚导航" className="flex flex-wrap gap-x-4 gap-y-2">
          <Link className="whitespace-nowrap hover:text-brand" href="/resources">浏览资源</Link>
          <Link className="whitespace-nowrap hover:text-brand" href="/topics">使用场景</Link>
          <Link className="whitespace-nowrap hover:text-brand" href="/submit">投稿指南</Link>
          <span className="basis-full sm:basis-auto">内容来自社区审核后的 Git 仓库</span>
        </nav>
      </div>
    </footer>
  );
}
