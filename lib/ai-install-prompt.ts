import type { Platform, Resource } from "./catalog-types";

const STATUS_LABELS = { native: "原生支持", supported: "明确支持", partial: "部分支持", unsupported: "不支持", unknown: "未确认" } as const;

export function createAiInstallPrompt(resource: Resource, platforms: ReadonlyArray<Platform>): string {
  const platformNames = new Map(platforms.map((platform) => [platform.id, platform.name]));
  const support = resource.compatibility.map((entry) => {
    const evidence = entry.evidenceUrl ? `；证据：${entry.evidenceUrl}` : "；暂无独立证据链接";
    const note = entry.note ? `；说明：${entry.note}` : "";
    return `- ${platformNames.get(entry.platform) ?? entry.platform}：${STATUS_LABELS[entry.status]}（核验 ${entry.verifiedAt}）${note}${evidence}`;
  }).join("\n");

  return `请帮助我安全安装并配置下面这个开源 AI 资源。\n\n资源：${resource.name}\n类型：${resource.kind.toUpperCase()}\n源码：${resource.repository}${resource.documentation ? `\n官方文档：${resource.documentation}` : ""}\n\n上游支持信息：\n${support}\n\n请严格按以下流程执行：\n1. 先阅读源码仓库和官方安装文档，确认当前最新的安装方式；不要仅凭资源名称或旧知识猜测。\n2. 检查我的操作系统、项目目录、已安装工具和正在使用的 AI 助手，再判断该资源是否兼容。不要假设我使用 Codex、Claude Code 或任何特定平台。\n3. 如果上游没有明确支持我的环境，先说明证据不足或不兼容并停止，不要编造配置。\n4. 给出将运行的命令、修改的文件、网络访问、权限需求和敏感变量，并用简洁语言解释风险。不要索要、打印或提交密钥。\n5. 在下载并执行第三方代码、全局安装、修改系统配置、覆盖文件或使用管理员权限前，先向我确认。\n6. 获得确认后再逐步安装；每一步失败都停止并解释，不要用危险命令绕过问题。\n7. 安装后执行最小验证，告诉我如何使用、更新、禁用和完整卸载，并列出实际修改过的文件。\n8. 不要替我 Star、关注、登录或进行与安装无关的外部操作。`;
}
