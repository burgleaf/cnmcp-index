import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { WebAnalytics } from "@/components/web-analytics";
import { PRODUCTION_SITE_URL } from "@/lib/env";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(PRODUCTION_SITE_URL),
  title: {
    default: "CNMCP AI 扩展社区",
    template: "%s | CNMCP AI 扩展社区",
  },
  description: "按职业和任务发现高质量 MCP、Skill 与 AI 插件，查看上游质量、支持证据并复制安全的 AI 安装提示词。",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "zh_CN",
    siteName: "CNMCP AI 扩展社区",
    url: "/",
    title: "CNMCP AI 扩展社区",
    description: "按职业和任务发现高质量 MCP、Skill 与 AI 插件，查看上游质量与支持证据。",
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-surface text-ink antialiased">
        <SiteHeader />
        {children}
        <SiteFooter />
        <WebAnalytics />
      </body>
    </html>
  );
}
