"use client";
import Script from "next/script";
export default function MarketplaceScript() {
  return <Script src="/marketglass/app.js" strategy="afterInteractive" onReady={() => window.bootMarketplace?.()} />;
}
