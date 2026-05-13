import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "重庆劳动法案情分析助手",
  description: "免费劳动仲裁分析工具，帮助劳动者了解自己的权益",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "劳动维权",
  },
  openGraph: {
    title: "重庆劳动法案情分析助手",
    description: "免费AI分析你的劳动争议，告诉你能不能仲裁、怎么操作",
    type: "website",
    locale: "zh_CN",
    images: [{ url: "/icons/icon-512.png", width: 512, height: 512 }],
  },
};

export const viewport: Viewport = {
  themeColor: "#6fb7b2",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "重庆劳动法案情分析助手",
    description: "免费AI分析劳动争议，提供仲裁指导和证据保全建议",
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Any",
    offers: { "@type": "Offer", price: "0", priceCurrency: "CNY" },
    inLanguage: "zh-CN",
  };

  return (
    <html lang="zh-CN">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>
        <a href="#main-content" className="skip-link">跳到主要内容</a>
        {children}
      </body>
    </html>
  );
}
