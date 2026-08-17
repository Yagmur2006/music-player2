import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AudioPlayerProvider } from "@/contexts/audio-player-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "پخش موسیقی کافه · سامانهٔ محلی",
  description:
    "سامانهٔ خودگردان مدیریت صدای کافه — لیست‌های پخش محلی، مرتب‌سازی کشیدنی، پخش پیوسته و دریافت موسیقی از تلگرام.",
};

export const viewport: Viewport = {
  themeColor: "#0b0907",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className="dark" suppressHydrationWarning>
      <body className="min-h-screen antialiased" suppressHydrationWarning>
        <AudioPlayerProvider>{children}</AudioPlayerProvider>
      </body>
    </html>
  );
}
