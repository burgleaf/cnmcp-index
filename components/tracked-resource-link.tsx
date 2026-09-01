"use client";

import { recordStatsEvent } from "@/lib/stats-client";

export function TrackedResourceLink({
  href,
  resourceId,
  children,
  className,
  ariaLabel,
}: Readonly<{
  href: string;
  resourceId: string;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}>) {
  return (
    <a
      aria-label={ariaLabel}
      className={className ?? "font-medium text-brand underline decoration-blue-200 underline-offset-4 hover:text-blue-700"}
      href={href}
      onClick={() => {
        void recordStatsEvent(resourceId, "source_visit", { keepalive: true }).catch(() => undefined);
      }}
      rel="noopener noreferrer"
      target="_blank"
    >
      {children}
    </a>
  );
}
