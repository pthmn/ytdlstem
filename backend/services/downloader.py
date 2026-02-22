"""
Media downloader service — handles YouTube, SoundCloud, Spotify downloads.
Uses yt-dlp for YouTube/SoundCloud and spotdl for Spotify.
Embeds all available metadata (thumbnail, artist, album, etc.).
"""

import os
import re
import asyncio

import yt_dlp

from services.queue import Job


def detect_platform(url_or_query: str) -> str:
    """Detect the platform from a URL or return 'search' for plain text."""
    url = url_or_query.strip()
    if re.match(r'https?://(www\.)?(youtube\.com|youtu\.be|music\.youtube\.com)', url):
        return "youtube"
    elif re.match(r'https?://(open\.)?spotify\.com', url):
        return "spotify"
    elif re.match(r'https?://(www\.|m\.)?soundcloud\.com', url):
        return "soundcloud"
    elif url.startswith("http://") or url.startswith("https://"):
        return "unknown"
    else:
        return "search"


async def search_songs(query: str, max_results: int = 10) -> list[dict]:
    """Search for songs by name using yt-dlp YouTube search."""
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': 'in_playlist',
    }

    # Use ytsearch directly as the URL
    search_url = f'ytsearch{max_results}:{query}'

    def _extract():
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(search_url, download=False)
            if not info:
                return []
            entries = info.get('entries', [])
            results = []
            for entry in entries:
                if not entry:
                    continue
                vid_id = entry.get('id', '')
                thumbnail = ''
                if entry.get('thumbnails'):
                    thumbnail = entry['thumbnails'][-1].get('url', '')
                elif entry.get('thumbnail'):
                    thumbnail = entry['thumbnail']

                results.append({
                    'id': vid_id,
                    'title': entry.get('title', 'Unknown'),
                    'url': entry.get('url') or entry.get('webpage_url') or f"https://www.youtube.com/watch?v={vid_id}",
                    'duration': entry.get('duration'),
                    'thumbnail': thumbnail,
                    'channel': entry.get('channel') or entry.get('uploader', ''),
                    'view_count': entry.get('view_count'),
                })
            return results

    return await asyncio.get_event_loop().run_in_executor(None, _extract)


async def get_formats(url: str) -> dict:
    """Get all available formats for a URL using yt-dlp."""
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
    }

    def _extract():
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

            # Get metadata
            metadata = {
                'title': info.get('title', 'Unknown'),
                'duration': info.get('duration'),
                'thumbnail': info.get('thumbnail', ''),
                'channel': info.get('channel') or info.get('uploader', ''),
                'upload_date': info.get('upload_date', ''),
                'description': (info.get('description', '') or '')[:500],
                'view_count': info.get('view_count'),
                'like_count': info.get('like_count'),
            }

            # Parse formats
            formats_raw = info.get('formats', [])
            video_formats = []
            audio_formats = []

            for f in formats_raw:
                fmt = {
                    'format_id': f.get('format_id', ''),
                    'ext': f.get('ext', ''),
                    'filesize': f.get('filesize') or f.get('filesize_approx'),
                    'format_note': f.get('format_note', ''),
                    'quality': f.get('quality', 0),
                    'tbr': f.get('tbr'),
                }

                vcodec = f.get('vcodec', 'none')
                acodec = f.get('acodec', 'none')

                if vcodec != 'none' and vcodec:
                    fmt.update({
                        'type': 'video',
                        'resolution': f.get('resolution') or f'{f.get("width", "?")}x{f.get("height", "?")}',
                        'fps': f.get('fps'),
                        'vcodec': vcodec,
                        'acodec': acodec if acodec != 'none' else None,
                        'has_audio': acodec != 'none' and bool(acodec),
                    })
                    video_formats.append(fmt)
                elif acodec != 'none' and acodec:
                    fmt.update({
                        'type': 'audio',
                        'acodec': acodec,
                        'abr': f.get('abr'),
                        'asr': f.get('asr'),
                    })
                    audio_formats.append(fmt)

            # Sort: best quality first
            video_formats.sort(key=lambda x: x.get('tbr') or 0, reverse=True)
            audio_formats.sort(key=lambda x: x.get('tbr') or x.get('abr') or 0, reverse=True)

            # Mark best
            if video_formats:
                video_formats[0]['is_best'] = True
            if audio_formats:
                audio_formats[0]['is_best'] = True

            return {
                'metadata': metadata,
                'video_formats': video_formats,
                'audio_formats': audio_formats,
            }

    return await asyncio.get_event_loop().run_in_executor(None, _extract)


async def handle_download(job: Job):
    """Handle a download job — called by queue worker."""
    params = job.params
    url = params['url']
    format_id = params.get('format_id', 'best')
    download_type = params.get('type', 'video')
    platform = detect_platform(url)

    job.message = f"Downloading from {platform}..."
    job.progress = 10.0

    if platform == "spotify":
        await _download_spotify(job, url)
    else:
        await _download_ytdlp(job, url, format_id, download_type)


async def _download_ytdlp(job: Job, url: str, format_id: str, download_type: str):
    """Download using yt-dlp with full metadata embedding."""
    output_template = os.path.join(job.output_dir, '%(title)s.%(ext)s')

    # Build format selector
    if format_id and format_id != 'best':
        format_selector = format_id
    elif download_type == 'audio':
        format_selector = 'bestaudio/best'
    else:
        format_selector = 'bestvideo+bestaudio/best'

    ydl_opts = {
        'format': format_selector,
        'outtmpl': output_template,
        'quiet': True,
        'no_warnings': True,
        # Metadata embedding
        'writethumbnail': True,
        'embedthumbnail': True,
        'addmetadata': True,
        'embed_metadata': True,
        'postprocessors': [],
    }

    # Add postprocessors
    if download_type == 'audio':
        ydl_opts['postprocessors'].append({
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '320',
        })

    # Embed metadata and thumbnail
    ydl_opts['postprocessors'].extend([
        {'key': 'FFmpegMetadata', 'add_metadata': True},
        {'key': 'EmbedThumbnail'},
    ])

    # Merge to mp4/mkv for video
    if download_type == 'video':
        ydl_opts['merge_output_format'] = 'mp4'

    def _progress_hook(d):
        if d['status'] == 'downloading':
            total = d.get('total_bytes') or d.get('total_bytes_estimate')
            downloaded = d.get('downloaded_bytes', 0)
            if total:
                job.progress = 10 + (downloaded / total) * 80
            job.message = f"Downloading... {d.get('_percent_str', '').strip()}"
        elif d['status'] == 'finished':
            job.progress = 90.0
            job.message = "Processing..."

    ydl_opts['progress_hooks'] = [_progress_hook]

    def _do_download():
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            return info

    info = await asyncio.get_event_loop().run_in_executor(None, _do_download)

    # Find the output file
    files = os.listdir(job.output_dir)
    # Filter out thumbnail files
    output_files = [f for f in files if not f.endswith(('.jpg', '.png', '.webp', '.json'))]

    if output_files:
        job.result = {
            'filename': output_files[0],
            'filepath': os.path.join(job.output_dir, output_files[0]),
            'title': info.get('title', 'Download'),
            'metadata': {
                'title': info.get('title'),
                'artist': info.get('artist') or info.get('channel') or info.get('uploader'),
                'album': info.get('album'),
                'duration': info.get('duration'),
            }
        }
    else:
        raise Exception("Download completed but no output file found")


async def _download_spotify(job: Job, url: str):
    """Download from Spotify using spotdl with metadata."""
    job.progress = 10.0
    job.message = "Fetching from Spotify..."

    cmd = [
        'spotdl', 'download', url,
        '--output', job.output_dir,
        '--format', 'mp3',
        '--bitrate', '320k',
    ]

    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    stdout, stderr = await process.communicate()

    if process.returncode != 0:
        error_msg = stderr.decode() if stderr else "Spotify download failed"
        raise Exception(error_msg[:500])

    job.progress = 90.0

    # Find output file
    files = os.listdir(job.output_dir)
    audio_files = [f for f in files if f.endswith(('.mp3', '.m4a', '.ogg', '.wav', '.flac'))]

    if audio_files:
        job.result = {
            'filename': audio_files[0],
            'filepath': os.path.join(job.output_dir, audio_files[0]),
            'title': os.path.splitext(audio_files[0])[0],
        }
    else:
        raise Exception("Spotify download completed but no output file found")
