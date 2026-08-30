import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-[calc(100vh-73px)] max-w-3xl place-items-center px-6 py-20 text-center">
      <div>
        <p className="text-sm font-semibold text-brand">404</p>
        <h1 className="mt-3 text-4xl font-bold">页面不存在</h1>
        <p className="mt-4 text-slate-600">你访问的页面可能已移动、下架或从未存在。</p>
        <Link
          className="mt-8 inline-flex rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
          href="/"
        >
          返回首页
        </Link>
      </div>
    </main>
  );
}
