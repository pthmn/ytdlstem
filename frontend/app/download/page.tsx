"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
    FiSearch,
    FiLink,
    FiDownload,
    FiVideo,
    FiHeadphones,
} from "react-icons/fi";
import {
    searchSongs,
    getFormats,
    startDownload,
    getDownloadStatus,
    getDownloadFileUrl,
    formatBytes,
    formatDuration,
    detectPlatform,
} from "@/lib/api";

type Format = {
    format_id: string;
    ext: string;
    type: string;
    resolution?: string;
    fps?: number;
    vcodec?: string;
    acodec?: string;
    abr?: number;
    asr?: number;
    tbr?: number;
    filesize?: number;
    format_note?: string;
    has_audio?: boolean;
    is_best?: boolean;
    quality?: number;
};

type SearchResult = {
    id: string;
    title: string;
    url: string;
    duration?: number;
    thumbnail?: string;
    channel?: string;
    view_count?: number;
};

type JobState = {
    jobId: string;
    status: string;
    progress: number;
    message: string;
    result?: {
        filename: string;
        title: string;
    };
    queue_position?: number;
};

export default function DownloadPage() {
    const [input, setInput] = useState("");
    const [mode, setMode] = useState<"url" | "search">("url");
    const [platform, setPlatform] = useState("");
    const [downloadType, setDownloadType] = useState<"video" | "audio">("video");

    // Search
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [searching, setSearching] = useState(false);

    // Formats
    const [formats, setFormats] = useState<{
        metadata?: Record<string, unknown>;
        video_formats?: Format[];
        audio_formats?: Format[];
    } | null>(null);
    const [loadingFormats, setLoadingFormats] = useState(false);
    const [selectedFormat, setSelectedFormat] = useState<string>("best");

    // Download
    const [job, setJob] = useState<JobState | null>(null);

    // Search timer
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    // Detect platform on input change
    useEffect(() => {
        const detected = detectPlatform(input);
        setPlatform(detected);
        setMode(detected === "search" ? "search" : "url");
    }, [input]);

    // Auto search
    useEffect(() => {
        if (mode === "search" && input.trim().length >= 2) {
            clearTimeout(searchTimerRef.current);
            searchTimerRef.current = setTimeout(async () => {
                setSearching(true);
                try {
                    const results = await searchSongs(input.trim());
                    setSearchResults(results);
                } catch {
                    setSearchResults([]);
                }
                setSearching(false);
            }, 500);
        } else {
            setSearchResults([]);
        }
        return () => clearTimeout(searchTimerRef.current);
    }, [input, mode]);

    // Fetch formats
    const fetchFormats = useCallback(async (url: string) => {
        setLoadingFormats(true);
        setFormats(null);
        setSelectedFormat("best");
        try {
            const data = await getFormats(url);
            setFormats(data);
            // Auto-select best
            const displayFormats = downloadType === "audio"
                ? data.audio_formats
                : data.video_formats;
            const best = displayFormats?.find((f: Format) => f.is_best);
            if (best) setSelectedFormat(best.format_id);
        } catch (err) {
            console.error(err);
        }
        setLoadingFormats(false);
    }, [downloadType]);

    // Select search result
    const selectResult = (result: SearchResult) => {
        setInput(result.url);
        setSearchResults([]);
        fetchFormats(result.url);
    };

    // Handle URL submit
    const handleFetchFormats = () => {
        if (mode === "url" && input.trim()) {
            fetchFormats(input.trim());
        }
    };

    // Start download
    const handleDownload = async () => {
        const url = input.trim();
        if (!url) return;

        try {
            const data = await startDownload(url, selectedFormat, downloadType);
            setJob({
                jobId: data.job_id,
                status: data.status,
                progress: 0,
                message: "Queued...",
                queue_position: data.queue_position,
            });
        } catch (err) {
            console.error(err);
        }
    };

    // Poll job status
    useEffect(() => {
        if (!job || job.status === "done" || job.status === "error") return;

        const interval = setInterval(async () => {
            try {
                const data = await getDownloadStatus(job.jobId);
                setJob({
                    jobId: data.job_id,
                    status: data.status,
                    progress: data.progress,
                    message: data.message,
                    result: data.result,
                    queue_position: data.queue_position,
                });
            } catch {
                // ignore errors
            }
        }, 1500);

        return () => clearInterval(interval);
    }, [job]);

    const displayFormats =
        downloadType === "audio" ? formats?.audio_formats : formats?.video_formats;

    const platformBadge = () => {
        if (!platform || platform === "search" || platform === "unknown") return null;
        return (
            <span className={`badge badge-${platform}`}>
                {platform}
            </span>
        );
    };

    return (
        <div className="page-container">
            <div className="page-header">
                <h1>Media Downloader</h1>
                <p>
                    Download from YouTube, Spotify & SoundCloud. Paste a URL or search by
                    song name.
                </p>
            </div>

            {/* Input */}
            <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
                    <div className="input-wrapper" style={{ flex: 1, minWidth: "280px" }}>
                        <div className="input-icon">
                            {mode === "search" ? <FiSearch /> : <FiLink />}
                        </div>
                        <input
                            className="input-field"
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && mode === "url" && handleFetchFormats()}
                            placeholder="Paste URL or type song name to search..."
                        />
                    </div>
                    {platformBadge()}
                    {mode === "url" && (
                        <button
                            className="btn btn-primary"
                            onClick={handleFetchFormats}
                            disabled={!input.trim() || loadingFormats}
                        >
                            {loadingFormats ? "Loading..." : "Get Formats"}
                        </button>
                    )}
                </div>

                {/* Search Results */}
                {searchResults.length > 0 && (
                    <div className="search-results" style={{ marginTop: "1rem" }}>
                        {searchResults.map((result) => (
                            <div
                                key={result.id}
                                className="search-result-item"
                                onClick={() => selectResult(result)}
                            >
                                {result.thumbnail && (
                                    <img
                                        src={result.thumbnail}
                                        alt=""
                                        className="search-result-thumb"
                                    />
                                )}
                                <div className="search-result-info">
                                    <h4>{result.title}</h4>
                                    <span>
                                        {result.channel}
                                        {result.duration ? ` · ${formatDuration(result.duration)}` : ""}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {searching && (
                    <div style={{ textAlign: "center", padding: "1rem", color: "var(--text-muted)" }}>
                        Searching...
                    </div>
                )}
            </div>

            {/* Type Toggle + Formats */}
            {formats && (
                <div className="glass-card animate-in" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
                    {/* Metadata */}
                    {formats.metadata && (
                        <div style={{ marginBottom: "1.25rem" }}>
                            <h3 style={{ fontSize: "1.1rem", marginBottom: "0.25rem" }}>
                                {(formats.metadata as Record<string, string>).title}
                            </h3>
                            <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                                {(formats.metadata as Record<string, string>).channel}
                                {(formats.metadata as Record<string, number>).duration
                                    ? ` · ${formatDuration((formats.metadata as Record<string, number>).duration)}`
                                    : ""}
                            </span>
                        </div>
                    )}

                    {/* Video / Audio toggle */}
                    <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
                        <div className="toggle-group">
                            <button
                                className={`toggle-option ${downloadType === "video" ? "active" : ""}`}
                                onClick={() => setDownloadType("video")}
                            >
                                <FiVideo style={{ marginRight: 4 }} size={14} /> Video
                            </button>
                            <button
                                className={`toggle-option ${downloadType === "audio" ? "active" : ""}`}
                                onClick={() => setDownloadType("audio")}
                            >
                                <FiHeadphones style={{ marginRight: 4 }} size={14} /> Audio
                            </button>
                        </div>
                    </div>

                    {/* Format Table */}
                    {displayFormats && displayFormats.length > 0 ? (
                        <div style={{ overflowX: "auto" }}>
                            <table className="format-table">
                                <thead>
                                    <tr>
                                        <th></th>
                                        {downloadType === "video" && <th>Resolution</th>}
                                        <th>Format</th>
                                        {downloadType === "video" && <th>FPS</th>}
                                        {downloadType === "video" && <th>Codec</th>}
                                        {downloadType === "audio" && <th>Bitrate</th>}
                                        {downloadType === "audio" && <th>Codec</th>}
                                        <th>Size</th>
                                        <th>Note</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {displayFormats.map((fmt) => (
                                        <tr
                                            key={fmt.format_id}
                                            className={selectedFormat === fmt.format_id ? "selected" : ""}
                                            onClick={() => setSelectedFormat(fmt.format_id)}
                                        >
                                            <td>
                                                <input
                                                    type="radio"
                                                    name="format"
                                                    checked={selectedFormat === fmt.format_id}
                                                    onChange={() => setSelectedFormat(fmt.format_id)}
                                                    style={{ accentColor: "var(--accent-1)" }}
                                                />
                                            </td>
                                            {downloadType === "video" && <td>{fmt.resolution}</td>}
                                            <td style={{ textTransform: "uppercase" }}>{fmt.ext}</td>
                                            {downloadType === "video" && <td>{fmt.fps || "—"}</td>}
                                            {downloadType === "video" && (
                                                <td style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                                                    {fmt.vcodec?.split(".")[0]}
                                                    {fmt.has_audio ? " + audio" : ""}
                                                </td>
                                            )}
                                            {downloadType === "audio" && (
                                                <td>{fmt.abr ? `${fmt.abr}k` : fmt.tbr ? `${Math.round(fmt.tbr)}k` : "—"}</td>
                                            )}
                                            {downloadType === "audio" && (
                                                <td style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                                                    {fmt.acodec?.split(".")[0] || "—"}
                                                </td>
                                            )}
                                            <td>{formatBytes(fmt.filesize)}</td>
                                            <td style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                                                {fmt.is_best && (
                                                    <span
                                                        style={{
                                                            background: "rgba(108, 92, 231, 0.2)",
                                                            color: "var(--accent-1)",
                                                            padding: "2px 8px",
                                                            borderRadius: "4px",
                                                            fontSize: "0.75rem",
                                                            marginRight: "0.5rem",
                                                            fontWeight: 600,
                                                        }}
                                                    >
                                                        BEST
                                                    </span>
                                                )}
                                                {fmt.format_note}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "1rem" }}>
                            No {downloadType} formats available
                        </p>
                    )}

                    {/* Download Button */}
                    <div style={{ marginTop: "1.25rem", display: "flex", justifyContent: "center" }}>
                        <button
                            className="btn btn-primary"
                            onClick={handleDownload}
                            disabled={!selectedFormat || !!job}
                            style={{ padding: "0.85rem 2.5rem", fontSize: "1rem" }}
                        >
                            <FiDownload /> Download
                        </button>
                    </div>
                </div>
            )}

            {/* Job Progress */}
            {job && (
                <div className="glass-card animate-in" style={{ padding: "1.5rem" }}>
                    {job.queue_position && job.queue_position > 0 && job.status === "queued" && (
                        <div className="queue-badge" style={{ marginBottom: "1rem" }}>
                            <span className="dot"></span>
                            Queue position: #{job.queue_position}
                        </div>
                    )}

                    <div className="progress-container">
                        <div className="progress-bar-wrapper">
                            <div
                                className="progress-bar-fill"
                                style={{ width: `${job.progress}%` }}
                            ></div>
                        </div>
                        <div className="progress-info">
                            <span>{job.message}</span>
                            <span>{Math.round(job.progress)}%</span>
                        </div>
                    </div>

                    {job.status === "done" && job.result && (
                        <div style={{ textAlign: "center", marginTop: "1rem" }}>
                            <a
                                href={getDownloadFileUrl(job.jobId)}
                                className="btn btn-primary"
                                style={{ textDecoration: "none" }}
                                download
                            >
                                <FiDownload /> Save {job.result.filename}
                            </a>
                        </div>
                    )}

                    {job.status === "error" && (
                        <div style={{ textAlign: "center", marginTop: "1rem", color: "#ff6b6b" }}>
                            Error: {job.message}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
