"use client";

import Link from "next/link";
import { FiDownload, FiMusic, FiMic, FiArrowRight } from "react-icons/fi";

const features = [
  {
    icon: FiDownload,
    title: "Media Downloader",
    description:
      "Download YouTube videos & audio, Spotify songs, and SoundCloud tracks. Full quality and format selection with all metadata embedded.",
    href: "/download",
    color: "rgba(108, 92, 231, 0.15)",
    iconColor: "#6c5ce7",
  },
  {
    icon: FiMusic,
    title: "Stem Separator",
    description:
      "AI-powered stem separation using Demucs. Split any song into vocals, drums, bass, and other instruments. MP3 or WAV output.",
    href: "/stems",
    color: "rgba(6, 182, 212, 0.15)",
    iconColor: "#06b6d4",
  },
  {
    icon: FiMic,
    title: "Karaoke Maker",
    description:
      "Remove vocals from any song to create karaoke/instrumental tracks. Upload a file, paste a URL, or search by name.",
    href: "/karaoke",
    color: "rgba(236, 72, 153, 0.15)",
    iconColor: "#ec4899",
  },
];

export default function HomePage() {
  return (
    <div className="page-container">
      <section className="hero">
        <h1>
          Download. Separate. <span>Create.</span>
        </h1>
        <p>
          Free all-in-one toolkit for downloading media from YouTube, Spotify &
          SoundCloud, AI-powered stem separation, and karaoke track creation.
        </p>
        <Link href="/download" className="btn btn-primary" style={{ fontSize: "1rem", padding: "0.85rem 2rem" }}>
          Get Started <FiArrowRight />
        </Link>
      </section>

      <div className="section-divider">Tools</div>

      <div className="features-grid">
        {features.map((feature) => (
          <Link key={feature.href} href={feature.href} className="feature-card glass-card animate-in">
            <div
              className="feature-icon"
              style={{ background: feature.color, color: feature.iconColor }}
            >
              <feature.icon size={24} />
            </div>
            <h3>{feature.title}</h3>
            <p>{feature.description}</p>
          </Link>
        ))}
      </div>

      <div style={{ textAlign: "center", marginTop: "4rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>
        <p>100% free &amp; open source · No account required · Powered by yt-dlp &amp; Demucs</p>
      </div>
    </div>
  );
}
