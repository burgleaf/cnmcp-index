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
  description: "发现、比较并安全使用 MCP、Skill 与 AI 编程工具插件。",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "zh_CN",
    siteName: "CNMCP AI 扩展社区",
    url: "/",
    title: "CNMCP AI 扩展社区",
    description: "发现、比较并安全使用 MCP、Skill 与 AI 编程工具插件。",
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
