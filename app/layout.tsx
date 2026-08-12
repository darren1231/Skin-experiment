import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"),
  title: "肌膚日誌｜看見保養真正的變化",
  description: "用一致的照片、左右臉實驗與每日量表，找出真正適合你的保養方法。",
  openGraph: {
    title: "肌膚日誌",
    description: "看見保養真正的變化",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "肌膚日誌分享預覽" }],
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant"><body>{children}</body></html>;
}
