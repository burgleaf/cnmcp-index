"use client";

import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";

import { SafeImage } from "./safe-image";

const PROTOCOL_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

export function sanitizeMarkdownUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || CONTROL_CHARACTER_PATTERN.test(trimmed) || trimmed.startsWith("//")) return "";

  if (PROTOCOL_PATTERN.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      return parsed.protocol === "https:" ? defaultUrlTransform(trimmed) : "";
    } catch {
      return "";
    }
  }

  return defaultUrlTransform(trimmed);
}

function isExternalLink(href: string | undefined): boolean {
  return Boolean(href && /^https:\/\//i.test(href));
}

export function MarkdownContent({ markdown }: Readonly<{ markdown: string }>) {
  return (
    <div className="markdown-content text-slate-700">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={sanitizeMarkdownUrl}
        components={{
          h1: ({ children }) => <h2>{children}</h2>,
          a: ({ href, children, title }) => {
            const external = isExternalLink(href);
            return (
              <a
                className="font-medium text-brand underline decoration-blue-200 underline-offset-4 hover:text-blue-700"
                href={href}
                rel={external ? "noopener noreferrer" : undefined}
                target={external ? "_blank" : undefined}
                title={title}
              >
                {children}
              </a>
            );
          },
          img: ({ src, alt }) => {
            if (typeof src !== "string" || !src) return null;
            return <SafeImage alt={alt ?? "资源说明图片"} className="my-5 max-h-[36rem] max-w-full rounded-xl border border-slate-200" src={src} />;
          },
          code: ({ children, className }) => (
            <code className={`${className ?? ""} rounded bg-slate-100 px-1.5 py-0.5 font-mono text-sm text-slate-900`}>
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="my-5 overflow-x-auto rounded-xl bg-slate-950 p-4 text-sm leading-6 text-slate-100">{children}</pre>
          ),
          table: ({ children }) => (
            <div className="my-5 overflow-x-auto"><table className="w-full border-collapse text-left text-sm">{children}</table></div>
          ),
          th: ({ children }) => <th className="border border-slate-300 bg-slate-100 px-3 py-2 font-semibold">{children}</th>,
          td: ({ children }) => <td className="border border-slate-300 px-3 py-2">{children}</td>,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
