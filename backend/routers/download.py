"""
Download API routes — formats listing, song search, download jobs.
"""

import os
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional

from services.queue import create_job, get_job, get_queue_position, register_handler
from services.downloader import (
    detect_platform,
    get_formats,
    search_songs,
    handle_download,
)

router = APIRouter()

# Register the download job handler
register_handler("download", handle_download)


class DownloadRequest(BaseModel):
    url: str
    format_id: str = "best"
    type: str = "video"  # video or audio


@router.get("/search")
async def search(q: str = Query(..., min_length=1)):
    """Search for songs by name."""
    try:
        results = await search_songs(q)
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/formats")
async def list_formats(url: str = Query(..., min_length=5)):
    """Get all available formats for a URL."""
    platform = detect_platform(url)
    if platform == "search":
        raise HTTPException(status_code=400, detail="Please provide a valid URL")
    if platform == "spotify":
        return {
            "platform": "spotify",
            "metadata": {"title": "Spotify Track"},
            "video_formats": [],
            "audio_formats": [
                {
                    "format_id": "spotify_mp3",
                    "ext": "mp3",
                    "type": "audio",
                    "format_note": "320kbps MP3 via spotdl",
                    "abr": 320,
                    "is_best": True,
                }
            ],
        }

    try:
        data = await get_formats(url)
        data["platform"] = platform
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/start")
async def start_download(req: DownloadRequest):
    """Queue a download job."""
    platform = detect_platform(req.url)
    if platform == "search":
        raise HTTPException(status_code=400, detail="Please provide a valid URL")

    job = create_job("download", {
        "url": req.url,
        "format_id": req.format_id,
        "type": req.type,
        "platform": platform,
    })

    return {
        "job_id": job.id,
        "status": job.status,
        "queue_position": get_queue_position(job.id),
    }


@router.get("/status/{job_id}")
async def download_status(job_id: str):
    """Get download job status."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return {
        "job_id": job.id,
        "status": job.status,
        "progress": job.progress,
        "message": job.message,
        "queue_position": get_queue_position(job.id),
        "result": job.result if job.status == "done" else None,
    }


@router.get("/file/{job_id}")
async def download_file(job_id: str):
    """Download the completed file."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != "done":
        raise HTTPException(status_code=400, detail="Job not complete")

    filepath = job.result.get('filepath')
    if not filepath or not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found")

    filename = job.result.get('filename', 'download')
    return FileResponse(
        filepath,
        filename=filename,
        media_type='application/octet-stream',
    )
