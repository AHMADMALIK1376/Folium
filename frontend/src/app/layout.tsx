import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "./globals.css";

/** Next self-hosts this at build time, so there is no runtime request to
 *  Google and no flash while a webfont loads. With no font declared at all the
 *  browser falls back to its default serif, which is why the app previously
 *  looked like a word processor. */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Folium",
  description: "A lightweight collaborative document editor",
  icons: { icon: "/images/websitelogo.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
