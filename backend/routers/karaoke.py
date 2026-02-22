"""
Karaoke maker API routes — removes vocals to create instrumental tracks.
"""

import os
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from typing import Optional

from services.queue import create_job, get_job, get_queue_position, register_handler
from services.separator import handle_karaoke
from services.downloader import detect_platform

router = APIRouter()

# Register the karaoke job handler
register_handler("karaoke", handle_karaoke)


@router.post("/start")
async def start_karaoke(
    url: Optional[str] = Form(None),
    output_format: str = Form("mp3"),
    file: Optional[UploadFile] = File(None),
):
    """Start a karaoke creation job. Provide either a file or URL."""
    job_params = {
        "output_format": output_format,
    }

    job = create_job("karaoke", job_params)

    if file:
        input_path = os.path.join(job.output_dir, f"input_{file.filename}")
        with open(input_path, "wb") as f:
            content = await file.read()
            f.write(content)
        job.params["input_file"] = input_path
    elif url:
        platform = detect_platform(url)
        if platform == "search":
            raise HTTPException(status_code=400, detail="Please provide a valid URL")
        job.params["url"] = url
        job.params["needs_download"] = True
        input_path = os.path.join(job.output_dir, "input_audio.mp3")
        job.params["input_file"] = input_path
        job.params["download_url"] = url
    else:
        raise HTTPException(status_code=400, detail="Provide either a file or URL")

    return {
        "job_id": job.id,
        "status": job.status,
        "queue_position": get_queue_position(job.id),
    }


@router.get("/status/{job_id}")
async def karaoke_status(job_id: str):
    """Get karaoke job status."""
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


@router.get("/download/{job_id}")
async def download_karaoke(job_id: str, track: Optional[str] = None):
    """Download karaoke tracks. Specify track='instrumental' or 'vocals'."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != "done":
        raise HTTPException(status_code=400, detail="Job not complete")

    tracks = job.result.get('tracks', {})

    if track and track in tracks:
        filepath = os.path.join(job.output_dir, tracks[track])
        if not os.path.exists(filepath):
            raise HTTPException(status_code=404, detail="Track file not found")
        return FileResponse(filepath, filename=tracks[track])

    # Default: return instrumental
    if 'instrumental' in tracks:
        filepath = os.path.join(job.output_dir, tracks['instrumental'])
        return FileResponse(filepath, filename=tracks['instrumental'])

    raise HTTPException(status_code=404, detail="No tracks available")
