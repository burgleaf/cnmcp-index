import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-[calc(100vh-73px)] max-w-3xl place-items-center px-6 py-20 text-center">
      <div>
        <p className="text-sm font-semibold text-brand">404</p>
        <h1 className="mt-3 text-4xl font-bold">页面不存在</h1>
        <p className="mt-4 text-slate-600">你访问的页面可能已移动、下架或从未存在。</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link className="inline-flex rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700" href="/resources">浏览资源</Link>
          <Link className="inline-flex rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-brand hover:text-brand" href="/topics">查看使用场景</Link>
          <Link className="inline-flex px-3 py-3 text-sm font-semibold text-slate-500 hover:text-brand" href="/">返回首页</Link>
        </div>
      </div>
    </main>
  );
}
