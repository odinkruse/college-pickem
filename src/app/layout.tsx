import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "College Pick'em",
  description: "Weekly college football QB/RB/WR pick'em",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b">
          <nav className="mx-auto flex w-full max-w-3xl items-center gap-4 px-4 py-3 text-sm">
            <Link href="/" className="font-semibold">
              College Pick&apos;em
            </Link>
            <Link href="/picks" className="text-muted-foreground hover:text-foreground">
              Picks
            </Link>
            <Link href="/picks/season" className="text-muted-foreground hover:text-foreground">
              Season
            </Link>
            <Link href="/standings" className="text-muted-foreground hover:text-foreground">
              Standings
            </Link>
            <Link href="/admin" className="text-muted-foreground hover:text-foreground">
              Admin
            </Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
