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
    default: "CNMCP AI扩展社区",
    template: "%s | CNMCP AI扩展社区",
  },
  description: "按职业和任务发现高质量 Skill、MCP 与 Plugin，查看可验证的上游质量信息并快速开始使用。",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "zh_CN",
    siteName: "CNMCP AI扩展社区",
    url: "/",
    title: "CNMCP AI扩展社区",
    description: "按职业和任务发现高质量 Skill、MCP 与 Plugin，查看可验证的上游质量信息并快速开始使用。",
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
