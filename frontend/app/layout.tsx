import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "YTDLStem — Download, Separate, Create",
  description:
    "Free tool to download YouTube, Spotify & SoundCloud media with quality selection, AI-powered stem separation, and karaoke maker.",
  keywords: [
    "youtube downloader",
    "spotify downloader",
    "soundcloud downloader",
    "stem separation",
    "karaoke maker",
    "demucs",
    "vocal remover",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Navbar />
        <main>{children}</main>
      </body>
    </html>
  );
}
