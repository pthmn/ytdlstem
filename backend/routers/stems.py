"""
Stem separation API routes.
"""

import os
import shutil
import zipfile
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from typing import Optional

from services.queue import create_job, get_job, get_queue_position, register_handler
from services.separator import handle_stems
from services.downloader import detect_platform

router = APIRouter()

# Register the stems job handler
register_handler("stems", handle_stems)


@router.post("/start")
async def start_stems(
    url: Optional[str] = Form(None),
    output_format: str = Form("mp3"),
    stems: str = Form("all"),
    file: Optional[UploadFile] = File(None),
):
    """Start a stem separation job. Provide either a file upload or a URL."""
    job_params = {
        "output_format": output_format,
        "stems": stems,
    }

    # Create job first to get output dir
    job = create_job("stems", job_params)

    if file:
        # Save uploaded file
        input_path = os.path.join(job.output_dir, f"input_{file.filename}")
        with open(input_path, "wb") as f:
            content = await file.read()
            f.write(content)
        job.params["input_file"] = input_path
    elif url:
        # Download from URL first, then process
        platform = detect_platform(url)
        if platform == "search":
            raise HTTPException(status_code=400, detail="Please provide a valid URL")
        job.params["url"] = url
        job.params["needs_download"] = True
        # We'll handle download in the job handler
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
async def stems_status(job_id: str):
    """Get stem separation job status."""
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
async def download_stems(job_id: str, stem: Optional[str] = None):
    """Download separated stems. If stem is specified, download single stem. Otherwise ZIP all."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != "done":
        raise HTTPException(status_code=400, detail="Job not complete")

    stems_dict = job.result.get('stems', {})

    if stem and stem in stems_dict:
        # Download single stem
        filepath = os.path.join(job.output_dir, stems_dict[stem])
        if not os.path.exists(filepath):
            raise HTTPException(status_code=404, detail="Stem file not found")
        return FileResponse(filepath, filename=stems_dict[stem])

    # Download all as ZIP
    zip_path = os.path.join(job.output_dir, "stems.zip")
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for stem_name, filename in stems_dict.items():
            filepath = os.path.join(job.output_dir, filename)
            if os.path.exists(filepath):
                zf.write(filepath, filename)

    return FileResponse(zip_path, filename="stems.zip", media_type="application/zip")
