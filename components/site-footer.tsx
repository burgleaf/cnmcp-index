import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-8 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getUTCFullYear()} CNMCP AI 扩展社区</p>
        <nav aria-label="页脚导航" className="flex gap-4">
          <Link className="hover:text-brand" href="/resources">资源目录</Link>
          <Link className="hover:text-brand" href="/submit">投稿指南</Link>
          <span>内容来自社区审核后的 Git 仓库</span>
        </nav>
      </div>
    </footer>
  );
}
