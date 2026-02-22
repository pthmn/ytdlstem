"""
In-memory async job queue for managing downloads and processing tasks.
Limits concurrency to prevent overloading free-tier hosting.
"""

import os
import uuid
import time
import asyncio
import shutil
from enum import Enum
from typing import Any, Callable, Coroutine
from dataclasses import dataclass, field


class JobStatus(str, Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    DONE = "done"
    ERROR = "error"


@dataclass
class Job:
    id: str
    job_type: str  # "download", "stems", "karaoke"
    params: dict
    status: JobStatus = JobStatus.QUEUED
    progress: float = 0.0
    message: str = ""
    result: dict = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)
    completed_at: float | None = None
    output_dir: str = ""


# Global state
MAX_WORKERS = int(os.getenv("MAX_WORKERS", "2"))
CLEANUP_AFTER_SECONDS = int(os.getenv("CLEANUP_AFTER", "1800"))  # 30 min
TEMP_DIR = os.getenv("TEMP_DIR", "/tmp/ytdlstem")

job_queue: asyncio.Queue = asyncio.Queue()
jobs: dict[str, Job] = {}
_workers: list[asyncio.Task] = []
_job_handlers: dict[str, Callable] = {}


def register_handler(job_type: str, handler: Callable[[Job], Coroutine]):
    """Register a handler function for a job type."""
    _job_handlers[job_type] = handler


def create_job(job_type: str, params: dict) -> Job:
    """Create a new job and add it to the queue."""
    job_id = str(uuid.uuid4())[:8]
    output_dir = os.path.join(TEMP_DIR, job_id)
    os.makedirs(output_dir, exist_ok=True)

    job = Job(
        id=job_id,
        job_type=job_type,
        params=params,
        output_dir=output_dir,
    )
    jobs[job_id] = job
    job_queue.put_nowait(job_id)
    return job


def get_job(job_id: str) -> Job | None:
    """Get a job by ID."""
    return jobs.get(job_id)


def get_queue_position(job_id: str) -> int:
    """Get 1-based queue position for a job. 0 if not queued."""
    if job_id not in jobs or jobs[job_id].status != JobStatus.QUEUED:
        return 0
    position = 1
    for jid, j in jobs.items():
        if j.status == JobStatus.QUEUED and j.created_at < jobs[job_id].created_at:
            position += 1
    return position


async def _worker(worker_id: int):
    """Background worker that processes jobs from the queue."""
    while True:
        try:
            job_id = await job_queue.get()
            job = jobs.get(job_id)
            if not job:
                job_queue.task_done()
                continue

            job.status = JobStatus.PROCESSING
            job.message = "Processing..."

            handler = _job_handlers.get(job.job_type)
            if not handler:
                job.status = JobStatus.ERROR
                job.message = f"No handler for job type: {job.job_type}"
                job_queue.task_done()
                continue

            try:
                await handler(job)
                job.status = JobStatus.DONE
                job.progress = 100.0
                job.completed_at = time.time()
                job.message = "Complete!"
            except Exception as e:
                job.status = JobStatus.ERROR
                job.message = str(e)
                job.completed_at = time.time()

            job_queue.task_done()
        except asyncio.CancelledError:
            break
        except Exception:
            pass


async def start_workers():
    """Start background worker tasks."""
    os.makedirs(TEMP_DIR, exist_ok=True)
    for i in range(MAX_WORKERS):
        task = asyncio.create_task(_worker(i))
        _workers.append(task)


async def stop_workers():
    """Stop all workers."""
    for task in _workers:
        task.cancel()
    await asyncio.gather(*_workers, return_exceptions=True)
    _workers.clear()


async def cleanup_old_jobs():
    """Periodically clean up completed job files."""
    while True:
        try:
            await asyncio.sleep(300)  # Check every 5 minutes
            now = time.time()
            to_remove = []
            for job_id, job in jobs.items():
                if job.completed_at and (now - job.completed_at) > CLEANUP_AFTER_SECONDS:
                    to_remove.append(job_id)
                    if os.path.exists(job.output_dir):
                        shutil.rmtree(job.output_dir, ignore_errors=True)
            for job_id in to_remove:
                del jobs[job_id]
        except asyncio.CancelledError:
            break
        except Exception:
            pass
