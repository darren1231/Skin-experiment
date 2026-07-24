import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });

export const metadata: Metadata = {
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
  return <html lang="zh-Hant"><body className={geist.variable}>{children}</body></html>;
}
