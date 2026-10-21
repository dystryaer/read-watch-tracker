import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "@/lib/zod-locale";

export const metadata: Metadata = {
  title: "Read-Watch-Tracker",
  description: "Wo stehe ich bei meinen Manga, Novels, E-Books und Serien?",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
  // Added to the iPhone home screen it opens full screen on the quick update (SPEC §9.3).
  appleWebApp: { capable: true, title: "Lesestand", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f766e",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
        {children}
      </body>
    </html>
  );
}
