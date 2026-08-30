import Script from "next/script";

import { publicEnvironment } from "@/lib/env";

export function WebAnalytics() {
  const token = publicEnvironment.cloudflareWebAnalyticsToken;
  if (!token) return null;

  return (
    <Script
      id="cloudflare-web-analytics"
      src="https://static.cloudflareinsights.com/beacon.min.js"
      strategy="afterInteractive"
      data-cf-beacon={JSON.stringify({ token })}
    />
  );
}
