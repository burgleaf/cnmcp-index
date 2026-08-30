"use client";

import { useState } from "react";

export const LOCAL_IMAGE_PLACEHOLDER = "/images/resource-placeholder.svg";

export function SafeImage({
  src,
  alt,
  className,
}: Readonly<{
  src: string;
  alt: string;
  className?: string;
}>) {
  const [failed, setFailed] = useState(false);
  const displayedSource = failed ? LOCAL_IMAGE_PLACEHOLDER : src;

  return (
    <span className="block">
      {/* 静态导出不使用 Next Image 运行时优化；资源图片已在内容生成阶段受控。 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt={failed ? `${alt}（原图加载失败，已显示本地占位图）` : alt}
        className={className}
        onError={() => setFailed(true)}
        src={displayedSource}
      />
      {failed ? (
        <span aria-live="polite" className="mt-2 block text-xs text-amber-800" role="status">
          图片加载失败，已显示本地占位图。
        </span>
      ) : null}
    </span>
  );
}
