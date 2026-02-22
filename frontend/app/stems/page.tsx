"use client";

import { useState, useEffect, useRef } from "react";
import {
    FiUpload,
    FiLink,
    FiSearch,
    FiDownload,
    FiMusic,
} from "react-icons/fi";
import {
    searchSongs,
    startStems,
    getStemsStatus,
    getStemDownloadUrl,
    formatDuration,
    detectPlatform,
} from "@/lib/api";

type SearchResult = {
    id: string;
    title: string;
    url: string;
    duration?: number;
    thumbnail?: string;
    channel?: string;
};

type JobState = {
    jobId: string;
    status: string;
    progress: number;
    message: string;
    result?: {
        stems: Record<string, string>;
        format: string;
    };
    queue_position?: number;
};

const STEM_COLORS: Record<string, string> = {
    vocals: "stem-vocals",
    drums: "stem-drums",
    bass: "stem-bass",
    other: "stem-other",
};

const STEM_LABELS: Record<string, string> = {
    vocals: "🎤",
    drums: "🥁",
    bass: "🎸",
    other: "🎹",
};

export default function StemsPage() {
    const [inputMode, setInputMode] = useState<"file" | "url" | "search">("url");
    const [url, setUrl] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [outputFormat, setOutputFormat] = useState<"mp3" | "wav">("mp3");
    const [selectedStems, setSelectedStems] = useState("all");
    const [dragOver, setDragOver] = useState(false);

    // Search
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [searching, setSearching] = useState(false);
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    // Job
    const [job, setJob] = useState<JobState | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Auto search
    useEffect(() => {
        if (inputMode === "search" && searchQuery.trim().length >= 2) {
            clearTimeout(searchTimerRef.current);
            searchTimerRef.current = setTimeout(async () => {
                setSearching(true);
                try {
                    const results = await searchSongs(searchQuery.trim());
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
    }, [searchQuery, inputMode]);

    const selectResult = (result: SearchResult) => {
        setUrl(result.url);
        setInputMode("url");
        setSearchResults([]);
        setSearchQuery("");
    };

    // File handling
    const handleFileDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile && droppedFile.type.startsWith("audio/")) {
            setFile(droppedFile);
            setInputMode("file");
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            setInputMode("file");
        }
    };

    // Start processing
    const handleStart = async () => {
        const formData = new FormData();
        formData.append("output_format", outputFormat);
        formData.append("stems", selectedStems);

        if (inputMode === "file" && file) {
            formData.append("file", file);
        } else if (url.trim()) {
            formData.append("url", url.trim());
        } else {
            return;
        }

        try {
            const data = await startStems(formData);
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

    // Poll status
    useEffect(() => {
        if (!job || job.status === "done" || job.status === "error") return;

        const interval = setInterval(async () => {
            try {
                const data = await getStemsStatus(job.jobId);
                setJob({
                    jobId: data.job_id,
                    status: data.status,
                    progress: data.progress,
                    message: data.message,
                    result: data.result,
                    queue_position: data.queue_position,
                });
            } catch {
                // ignore
            }
        }, 2000);

        return () => clearInterval(interval);
    }, [job]);

    const canStart =
        (inputMode === "file" && file) ||
        (inputMode === "url" && url.trim()) ||
        false;

    return (
        <div className="page-container">
            <div className="page-header">
                <h1>Stem Separator</h1>
                <p>
                    Split any song into vocals, drums, bass, and other instruments using
                    AI-powered Demucs.
                </p>
            </div>

            {/* Input Mode Tabs */}
            <div className="tabs">
                <button
                    className={`tab ${inputMode === "url" ? "active" : ""}`}
                    onClick={() => setInputMode("url")}
                >
                    <FiLink style={{ marginRight: 4 }} size={14} /> URL
                </button>
                <button
                    className={`tab ${inputMode === "file" ? "active" : ""}`}
                    onClick={() => setInputMode("file")}
                >
                    <FiUpload style={{ marginRight: 4 }} size={14} /> Upload File
                </button>
                <button
                    className={`tab ${inputMode === "search" ? "active" : ""}`}
                    onClick={() => setInputMode("search")}
                >
                    <FiSearch style={{ marginRight: 4 }} size={14} /> Search
                </button>
            </div>

            {/* Input Area */}
            <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
                {inputMode === "url" && (
                    <div className="input-wrapper">
                        <div className="input-icon"><FiLink /></div>
                        <input
                            className="input-field"
                            type="text"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="Paste YouTube, Spotify, or SoundCloud URL..."
                        />
                    </div>
                )}

                {inputMode === "file" && (
                    <>
                        <div
                            className={`upload-zone ${dragOver ? "dragover" : ""}`}
                            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={handleFileDrop}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <div className="upload-zone-icon"><FiUpload /></div>
                            <div className="upload-zone-text">
                                {file ? (
                                    <>
                                        Selected: <strong>{file.name}</strong>
                                    </>
                                ) : (
                                    <>
                                        Drag & drop an audio file here, or{" "}
                                        <strong>click to browse</strong>
                                    </>
                                )}
                            </div>
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="audio/*"
                            onChange={handleFileSelect}
                            style={{ display: "none" }}
                        />
                    </>
                )}

                {inputMode === "search" && (
                    <>
                        <div className="input-wrapper">
                            <div className="input-icon"><FiSearch /></div>
                            <input
                                className="input-field"
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search for a song..."
                            />
                        </div>
                        {searching && (
                            <div style={{ textAlign: "center", padding: "1rem", color: "var(--text-muted)" }}>
                                Searching...
                            </div>
                        )}
                        {searchResults.length > 0 && (
                            <div className="search-results" style={{ marginTop: "0.75rem" }}>
                                {searchResults.map((r) => (
                                    <div key={r.id} className="search-result-item" onClick={() => selectResult(r)}>
                                        {r.thumbnail && <img src={r.thumbnail} alt="" className="search-result-thumb" />}
                                        <div className="search-result-info">
                                            <h4>{r.title}</h4>
                                            <span>{r.channel}{r.duration ? ` · ${formatDuration(r.duration)}` : ""}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Options */}
            <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", alignItems: "center" }}>
                    {/* Output Format */}
                    <div>
                        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.5rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            Output Format
                        </div>
                        <div className="toggle-group">
                            <button
                                className={`toggle-option ${outputFormat === "mp3" ? "active" : ""}`}
                                onClick={() => setOutputFormat("mp3")}
                            >
                                MP3
                            </button>
                            <button
                                className={`toggle-option ${outputFormat === "wav" ? "active" : ""}`}
                                onClick={() => setOutputFormat("wav")}
                            >
                                WAV
                            </button>
                        </div>
                    </div>

                    {/* Stem Selection */}
                    <div>
                        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.5rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            Stems
                        </div>
                        <div className="toggle-group">
                            {["all", "vocals", "drums", "bass", "other"].map((s) => (
                                <button
                                    key={s}
                                    className={`toggle-option ${selectedStems === s ? "active" : ""}`}
                                    onClick={() => setSelectedStems(s)}
                                    style={{ textTransform: "capitalize" }}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div style={{ marginTop: "1.5rem", textAlign: "center" }}>
                    <button
                        className="btn btn-primary"
                        onClick={handleStart}
                        disabled={!canStart || (!!job && job.status !== "done" && job.status !== "error")}
                        style={{ padding: "0.85rem 2.5rem" }}
                    >
                        <FiMusic /> Separate Stems
                    </button>
                </div>
            </div>

            {/* Job Progress */}
            {job && (
                <div className="glass-card animate-in" style={{ padding: "1.5rem" }}>
                    {job.queue_position && job.queue_position > 0 && job.status === "queued" && (
                        <div className="queue-badge" style={{ marginBottom: "1rem" }}>
                            <span className="dot"></span>
                            Queue position: #{job.queue_position}
                        </div>
                    )}

                    {job.status !== "done" && (
                        <div className="progress-container">
                            <div className="progress-bar-wrapper">
                                <div className="progress-bar-fill" style={{ width: `${job.progress}%` }}></div>
                            </div>
                            <div className="progress-info">
                                <span>{job.message}</span>
                                <span>{Math.round(job.progress)}%</span>
                            </div>
                        </div>
                    )}

                    {job.status === "done" && job.result && (
                        <>
                            <h3 style={{ marginBottom: "1rem", fontSize: "1.1rem" }}>
                                ✨ Stems Ready
                            </h3>
                            <div className="stem-grid">
                                {Object.entries(job.result.stems).map(([stem, filename]) => (
                                    <div key={stem} className="stem-card glass-card">
                                        <div className="stem-card-title">
                                            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                                                <div className={`stem-icon ${STEM_COLORS[stem] || "stem-other"}`}>
                                                    {STEM_LABELS[stem] || "🎵"}
                                                </div>
                                                <h3>{stem}</h3>
                                            </div>
                                            <a
                                                href={getStemDownloadUrl(job.jobId, stem)}
                                                className="btn btn-secondary btn-sm"
                                                download
                                            >
                                                <FiDownload size={14} />
                                            </a>
                                        </div>
                                        <audio controls style={{ width: "100%" }}>
                                            <source src={getStemDownloadUrl(job.jobId, stem)} />
                                        </audio>
                                    </div>
                                ))}
                            </div>
                            <div style={{ textAlign: "center", marginTop: "1.25rem" }}>
                                <a
                                    href={getStemDownloadUrl(job.jobId)}
                                    className="btn btn-primary"
                                    download
                                >
                                    <FiDownload /> Download All (ZIP)
                                </a>
                            </div>
                        </>
                    )}

                    {job.status === "error" && (
                        <div style={{ textAlign: "center", color: "#ff6b6b" }}>
                            Error: {job.message}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
