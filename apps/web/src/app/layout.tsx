import type { Metadata } from "next";
import { Alegreya, Cinzel } from "next/font/google";
import "./globals.css";

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-cinzel"
});

const alegreya = Alegreya({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-alegreya"
});

export const metadata: Metadata = {
  title: "DND Scribe",
  description: "Live transcription and summaries for tabletop sessions."
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${cinzel.variable} ${alegreya.variable}`}>
      <body className="text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
