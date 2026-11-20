import type { Metadata } from "next";
import { IBM_Plex_Mono, Press_Start_2P } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { SiteNav, SiteNavFallback } from "@/components/site-nav";
import { getSiteTheme } from "@/lib/theme/champion";
import "./globals.css";

// Pixel font for headings, scores and buttons; a readable monospace for everything else.
const pressStart = Press_Start_2P({
  variable: "--font-press-start",
  weight: "400",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "College Pick'em",
  description: "Weekly college football QB/RB/WR pick'em",
};

/**
 * This week's colors (champion's team, or a special week's palette) as CSS variable overrides. The
 * values are cached, so they're part of the prerendered page; they're generated hex colors only.
 */
async function ThemeStyle() {
  const { css } = await getSiteTheme();
  return css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null;
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`dark ${pressStart.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Suspense fallback={null}>
          <ThemeStyle />
        </Suspense>
        <header className="border-b-4 border-primary bg-card">
          <nav className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 font-pixel text-[10px]">
            <Link href="/" className="text-xs text-primary no-underline">
              <span className="hidden sm:inline">College </span>Pick&apos;em
            </Link>
            <Suspense fallback={<SiteNavFallback />}>
              <SiteNav />
            </Suspense>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
