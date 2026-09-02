import type { Metadata } from "next";

import { AgentSubmissionPrompt } from "@/components/agent-submission-prompt";
import resourceExample from "@/examples/resource-submission/resource.json";
import { PRODUCTION_SITE_URL, publicEnvironment } from "@/lib/env";
import { createSubmissionLinks, resolveCatalogRepositoryUrl } from "@/lib/submission";

export const metadata: Metadata = {
  title: "投稿资源",
  description: "复制 AI 提示词，或通过 GitHub Issue Form / Pull Request 向 CNMCP AI 扩展社区投稿资源。",
  alternates: { canonical: `${PRODUCTION_SITE_URL}/submit/` },
};

const resourceExampleText = JSON.stringify(resourceExample, null, 2);

function ExternalAction({ href, children }: Readonly<{ href: string; children: React.ReactNode }>) {
  return (
    <a
      className="inline-flex rounded-lg bg-brand px-4 py-2.5 font-semibold text-white transition hover:bg-blue-700"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      {children}
    </a>
  );
}

export default function SubmitPage() {
  const links = createSubmissionLinks(publicEnvironment.githubRepositoryUrl);
  const catalogRepositoryUrl = resolveCatalogRepositoryUrl(publicEnvironment.githubRepositoryUrl);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="max-w-3xl">
        <p className="text-sm font-semibold text-brand">社区投稿</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-ink">投稿 AI 扩展资源</h1>
        <p className="mt-4 text-lg leading-8 text-slate-700">
          推荐复制一段提示词，交给你正在使用的 AI 助手完成校验并提交 Pull Request。
          也可以继续使用 GitHub Issue Form 或手写 PR。投稿内容只有在维护者审核并合并到默认分支后，才会进入正式 Catalog 和生产站点。
        </p>
      </header>

      <div className="mt-8">
        <AgentSubmissionPrompt catalogRepositoryUrl={catalogRepositoryUrl} />
      </div>

      {!links ? (
        <section className="mt-8 rounded-2xl border border-amber-300 bg-amber-50 p-6" aria-labelledby="repository-unconfigured">
          <h2 className="text-xl font-bold text-amber-950" id="repository-unconfigured">仓库入口尚未配置</h2>
          <p className="mt-2 leading-7 text-amber-900">
            当前部署没有配置可验证的 GitHub 仓库地址，因此不会生成可能误导你的 Issue / PR 外链。维护者应设置
            <code className="mx-1 rounded bg-amber-100 px-1.5 py-0.5">NEXT_PUBLIC_GITHUB_REPOSITORY_URL</code>
            后重新构建。AI 提示词仍指向正式索引仓库。仓库内投稿模板路径为
            <code className="mx-1 rounded bg-amber-100 px-1.5 py-0.5">.github/ISSUE_TEMPLATE/resource-submission.yml</code>
            和 <code className="rounded bg-amber-100 px-1.5 py-0.5">.github/pull_request_template.md</code>。
          </p>
        </section>
      ) : null}

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-ink">使用 Issue Form</h2>
          <p className="mt-3 leading-7 text-slate-700">
            适合不想直接修改文件、也不使用 AI 助手的投稿者。表单会收集资源类型、源码地址、中文摘要和许可证；只有上游明确说明时才补充平台接入证据。
          </p>
          <div className="mt-5">
            {links ? <ExternalAction href={links.issueForm}>打开资源投稿表单</ExternalAction> : <span className="text-sm text-slate-500">配置仓库地址后提供入口</span>}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-ink">直接提交 Pull Request</h2>
          <p className="mt-3 leading-7 text-slate-700">
            在 <code>resources/&lt;resource-id&gt;/</code> 新增 <code>resource.json</code> 和安全的 <code>README.md</code>，可选提交本地图片，并使用 PR 模板逐项自检。
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            {links ? <ExternalAction href={links.pullRequest}>发起 Pull Request</ExternalAction> : <span className="text-sm text-slate-500">配置仓库地址后提供入口</span>}
            {links ? (
              <a className="inline-flex rounded-lg border border-slate-300 px-4 py-2.5 font-semibold text-slate-700 hover:border-brand hover:text-brand" href={links.example} rel="noopener noreferrer" target="_blank">
                查看仓库示例
              </a>
            ) : null}
            {links ? (
              <a className="inline-flex rounded-lg border border-slate-300 px-4 py-2.5 font-semibold text-slate-700 hover:border-brand hover:text-brand" href={links.skill} rel="noopener noreferrer" target="_blank">
                查看投稿 Skill
              </a>
            ) : null}
          </div>
        </section>
      </div>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8" aria-labelledby="required-fields">
        <h2 className="text-2xl font-bold text-ink" id="required-fields">必填信息与审核边界</h2>
        <ul className="mt-4 list-disc space-y-2 pl-6 leading-7 text-slate-700">
          <li>类型只能是 MCP、Skill 或面向已注册 AI 编程工具的插件。</li>
          <li>必须提供公开 HTTPS 源码地址、许可证、作者，以及面向职业、任务和能力的受控标签。</li>
          <li>每个资源必须提供面向详情页的 README，说明解决的问题、核心能力、适用人群、使用注意事项和官方资源。</li>
          <li>平台支持只记录原作者声明，附核验日期与证据链接；它不会影响质量排序。</li>
          <li>详情页按 AI 工具提供简明安装命令或提示词；站点、CI 和审核流程都不会执行第三方命令。</li>
          <li>投稿者不得控制 <code>featured</code>，也不得添加不存在的 <code>verified</code> 或 <code>reviewStatus</code>。精选不代表安全审计。</li>
        </ul>
      </section>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-slate-950 p-6 text-slate-100 shadow-sm md:p-8" aria-labelledby="resource-example">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-2xl font-bold" id="resource-example">resource.json 示例</h2>
          <code className="text-sm text-slate-300">examples/resource-submission/resource.json</code>
        </div>
        <pre className="mt-5 overflow-x-auto rounded-xl bg-black/30 p-4 text-sm leading-6"><code>{resourceExampleText}</code></pre>
      </section>
    </main>
  );
}
