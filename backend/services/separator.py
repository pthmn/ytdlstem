"""
Stem separation and karaoke service using Demucs.
Supports htdemucs model for 4-stem separation (vocals, drums, bass, other).
"""

import os
import asyncio
import shutil
import subprocess
from pydub import AudioSegment

from services.queue import Job
import yt_dlp


async def _pre_download_if_needed(job: Job):
    """If the job has a URL, download the audio first."""
    if job.params.get('needs_download') and job.params.get('download_url'):
        url = job.params['download_url']
        input_file = job.params['input_file']
        job.message = "Downloading audio from URL..."
        job.progress = 5.0

        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': input_file.replace('.mp3', '.%(ext)s'),
            'quiet': True,
            'no_warnings': True,
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '320',
            }],
        }

        def _dl():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])

        await asyncio.get_event_loop().run_in_executor(None, _dl)

        # Find the downloaded file
        for f in os.listdir(job.output_dir):
            if f.startswith('input_audio') and not f.endswith('.part'):
                job.params['input_file'] = os.path.join(job.output_dir, f)
                break


async def handle_stems(job: Job):
    """Handle a stem separation job."""
    await _pre_download_if_needed(job)

    params = job.params
    output_format = params.get('output_format', 'mp3')
    selected_stems = params.get('stems', 'all')  # all, vocals, drums, bass, other
    input_file = params.get('input_file')

    if not input_file or not os.path.exists(input_file):
        raise Exception("No input audio file found")

    job.message = "Running stem separation with Demucs..."
    job.progress = 15.0

    # Run Demucs
    demucs_output = os.path.join(job.output_dir, 'demucs_out')
    os.makedirs(demucs_output, exist_ok=True)

    cmd = [
        'python', '-m', 'demucs',
        '--name', 'htdemucs',
        '--out', demucs_output,
        '--mp3' if output_format == 'mp3' else '--float32',
        input_file,
    ]

    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    # Read stderr for progress (Demucs outputs progress to stderr)
    async def read_progress():
        while True:
            line = await process.stderr.readline()
            if not line:
                break
            text = line.decode(errors='ignore').strip()
            if '%' in text:
                try:
                    pct = float(text.split('%')[0].split()[-1])
                    job.progress = 15 + (pct * 0.7)
                except (ValueError, IndexError):
                    pass
            job.message = f"Separating stems... {text[:100]}"

    await read_progress()
    await process.wait()

    if process.returncode != 0:
        stderr_out = await process.stderr.read()
        raise Exception(f"Demucs failed: {stderr_out.decode(errors='ignore')[:500]}")

    job.progress = 85.0
    job.message = "Preparing output files..."

    # Find Demucs output directory
    # Demucs outputs to: <out>/htdemucs/<track_name>/
    htdemucs_dir = os.path.join(demucs_output, 'htdemucs')
    if not os.path.exists(htdemucs_dir):
        raise Exception("Demucs output directory not found")

    track_dirs = os.listdir(htdemucs_dir)
    if not track_dirs:
        raise Exception("No separated tracks found")

    track_dir = os.path.join(htdemucs_dir, track_dirs[0])
    stem_names = ['vocals', 'drums', 'bass', 'other']

    result_files = {}
    ext = 'mp3' if output_format == 'mp3' else 'wav'

    for stem in stem_names:
        if selected_stems != 'all' and stem != selected_stems:
            continue

        # Find the stem file
        stem_file = None
        for f in os.listdir(track_dir):
            if f.startswith(stem):
                stem_file = os.path.join(track_dir, f)
                break

        if stem_file and os.path.exists(stem_file):
            # Convert if needed
            output_file = os.path.join(job.output_dir, f'{stem}.{ext}')
            if stem_file.endswith(f'.{ext}'):
                shutil.copy2(stem_file, output_file)
            else:
                audio = AudioSegment.from_file(stem_file)
                if ext == 'mp3':
                    audio.export(output_file, format='mp3', bitrate='320k')
                else:
                    audio.export(output_file, format='wav')
            result_files[stem] = f'{stem}.{ext}'

    job.progress = 95.0

    # Clean up demucs output
    shutil.rmtree(demucs_output, ignore_errors=True)

    job.result = {
        'stems': result_files,
        'format': ext,
    }


async def handle_karaoke(job: Job):
    """Handle a karaoke job — extracts instrumental and vocals."""
    await _pre_download_if_needed(job)

    params = job.params
    output_format = params.get('output_format', 'mp3')
    input_file = params.get('input_file')

    if not input_file or not os.path.exists(input_file):
        raise Exception("No input audio file found")

    job.message = "Creating karaoke track with Demucs..."
    job.progress = 15.0

    # Run Demucs — we only need vocals and no_vocals separation
    # Using --two-stems vocals to split into vocals + accompaniment
    demucs_output = os.path.join(job.output_dir, 'demucs_out')
    os.makedirs(demucs_output, exist_ok=True)

    cmd = [
        'python', '-m', 'demucs',
        '--name', 'htdemucs',
        '--two-stems', 'vocals',
        '--out', demucs_output,
        '--mp3' if output_format == 'mp3' else '--float32',
        input_file,
    ]

    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    async def read_progress():
        while True:
            line = await process.stderr.readline()
            if not line:
                break
            text = line.decode(errors='ignore').strip()
            if '%' in text:
                try:
                    pct = float(text.split('%')[0].split()[-1])
                    job.progress = 15 + (pct * 0.7)
                except (ValueError, IndexError):
                    pass
            job.message = f"Removing vocals... {text[:100]}"

    await read_progress()
    await process.wait()

    if process.returncode != 0:
        stderr_out = await process.stderr.read()
        raise Exception(f"Demucs failed: {stderr_out.decode(errors='ignore')[:500]}")

    job.progress = 85.0
    job.message = "Preparing karaoke files..."

    # Find output
    htdemucs_dir = os.path.join(demucs_output, 'htdemucs')
    track_dirs = os.listdir(htdemucs_dir)
    if not track_dirs:
        raise Exception("No output tracks found")

    track_dir = os.path.join(htdemucs_dir, track_dirs[0])
    ext = 'mp3' if output_format == 'mp3' else 'wav'
    result_files = {}

    for stem_name in ['no_vocals', 'vocals']:
        stem_file = None
        for f in os.listdir(track_dir):
            if f.startswith(stem_name):
                stem_file = os.path.join(track_dir, f)
                break

        if stem_file and os.path.exists(stem_file):
            label = 'instrumental' if stem_name == 'no_vocals' else 'vocals'
            output_file = os.path.join(job.output_dir, f'{label}.{ext}')
            if stem_file.endswith(f'.{ext}'):
                shutil.copy2(stem_file, output_file)
            else:
                audio = AudioSegment.from_file(stem_file)
                if ext == 'mp3':
                    audio.export(output_file, format='mp3', bitrate='320k')
                else:
                    audio.export(output_file, format='wav')
            result_files[label] = f'{label}.{ext}'

    # Clean up
    shutil.rmtree(demucs_output, ignore_errors=True)

    job.result = {
        'tracks': result_files,
        'format': ext,
    }
