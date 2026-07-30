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
      {/* Browser extensions (password managers, ColorZilla, dark-mode tools)
          inject attributes into <body> before React hydrates, which React
          reports as a mismatch. This suppresses the warning for this element's
          own attributes only — children still report mismatches normally, so a
          real hydration bug is not hidden. Without it the dev overlay shows a
          permanent issue, and permanent noise is how genuine warnings get
          ignored. */}
      <body className="font-sans antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
