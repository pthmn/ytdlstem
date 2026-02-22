import axios from "axios";

function getApiBase(): string {
    // If env var is set (baked in at build time), use it
    if (process.env.NEXT_PUBLIC_API_URL) {
        return process.env.NEXT_PUBLIC_API_URL;
    }

    // Auto-detect at runtime in browser
    if (typeof window !== "undefined") {
        const hostname = window.location.hostname;
        // If on Render (*.onrender.com), derive backend URL from frontend URL
        if (hostname.includes("onrender.com")) {
            const backendHost = hostname.replace("-frontend", "-backend");
            return `https://${backendHost}`;
        }
    }

    // Default: local development
    return "http://localhost:8000";
}

// Lazy-initialized API base — resolved on first use in the browser
let _apiBase: string | null = null;

function apiBase(): string {
    if (_apiBase === null) {
        _apiBase = getApiBase();
    }
    return _apiBase;
}

// Create axios instance with dynamic baseURL via interceptor
const api = axios.create({
    timeout: 30000,
});

// Set baseURL dynamically before each request
api.interceptors.request.use((config) => {
    config.baseURL = apiBase();
    return config;
});

// ===== Download APIs =====

export async function searchSongs(query: string) {
    const { data } = await api.get("/api/download/search", { params: { q: query } });
    return data.results;
}

export async function getFormats(url: string) {
    const { data } = await api.get("/api/download/formats", { params: { url } });
    return data;
}

export async function startDownload(url: string, formatId: string, type: string) {
    const { data } = await api.post("/api/download/start", {
        url,
        format_id: formatId,
        type,
    });
    return data;
}

export async function getDownloadStatus(jobId: string) {
    const { data } = await api.get(`/api/download/status/${jobId}`);
    return data;
}

export function getDownloadFileUrl(jobId: string) {
    return `${apiBase()}/api/download/file/${jobId}`;
}

// ===== Stems APIs =====

export async function startStems(formData: FormData) {
    const { data } = await api.post("/api/stems/start", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 60000,
    });
    return data;
}

export async function getStemsStatus(jobId: string) {
    const { data } = await api.get(`/api/stems/status/${jobId}`);
    return data;
}

export function getStemDownloadUrl(jobId: string, stem?: string) {
    const params = stem ? `?stem=${stem}` : "";
    return `${apiBase()}/api/stems/download/${jobId}${params}`;
}

// ===== Karaoke APIs =====

export async function startKaraoke(formData: FormData) {
    const { data } = await api.post("/api/karaoke/start", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 60000,
    });
    return data;
}

export async function getKaraokeStatus(jobId: string) {
    const { data } = await api.get(`/api/karaoke/status/${jobId}`);
    return data;
}

export function getKaraokeDownloadUrl(jobId: string, track?: string) {
    const params = track ? `?track=${track}` : "";
    return `${apiBase()}/api/karaoke/download/${jobId}${params}`;
}

// ===== Format Helpers =====

export function formatBytes(bytes: number | null | undefined): string {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDuration(seconds: number | null | undefined): string {
    if (!seconds) return "—";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}

export function detectPlatform(input: string): string {
    const url = input.trim();
    if (/https?:\/\/(www\.)?(youtube\.com|youtu\.be|music\.youtube\.com)/i.test(url)) return "youtube";
    if (/https?:\/\/(open\.)?spotify\.com/i.test(url)) return "spotify";
    if (/https?:\/\/(www\.|m\.)?soundcloud\.com/i.test(url)) return "soundcloud";
    if (url.startsWith("http://") || url.startsWith("https://")) return "unknown";
    return "search";
}
