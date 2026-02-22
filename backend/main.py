"""
YTDLStem Backend — FastAPI server for media downloading, stem separation, and karaoke generation.
"""

import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from services.queue import job_queue, start_workers, stop_workers, cleanup_old_jobs
from routers import download, stems, karaoke


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    # Start background workers
    await start_workers()
    # Start cleanup task
    cleanup_task = asyncio.create_task(cleanup_old_jobs())
    yield
    # Shutdown
    cleanup_task.cancel()
    await stop_workers()


app = FastAPI(
    title="YTDLStem API",
    description="Download media, separate stems, create karaoke tracks",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow frontend origin
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(download.router, prefix="/api/download", tags=["Download"])
app.include_router(stems.router, prefix="/api/stems", tags=["Stems"])
app.include_router(karaoke.router, prefix="/api/karaoke", tags=["Karaoke"])


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    queue_size = job_queue.qsize()
    return {
        "status": "ok",
        "queue_size": queue_size,
    }
