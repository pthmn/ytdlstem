FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    pipx \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install PyTorch CPU-only first (smaller)
RUN pip install --no-cache-dir torch torchaudio --index-url https://download.pytorch.org/whl/cpu

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install spotdl in isolated environment (avoids FastAPI version conflict)
RUN pipx install spotdl && \
    ln -s /root/.local/bin/spotdl /usr/local/bin/spotdl

# Copy application code
COPY . .

# Create temp directory
RUN mkdir -p /tmp/ytdlstem

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
