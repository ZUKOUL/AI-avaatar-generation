FROM python:3.13-slim

WORKDIR /app

# System deps:
#   libjpeg + zlib → Pillow (image manipulation)
#   ffmpeg         → Auto-Clip pipeline (download, cut, reframe, burn subs)
#   fonts-dejavu   → ASS subtitle rendering needs a real font available at runtime
#                    so the burn-in step can draw word-level karaoke captions.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libjpeg62-turbo-dev \
    zlib1g-dev \
    ffmpeg \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Render sets the PORT env var automatically
ENV PORT=10000
EXPOSE ${PORT}

# Run the FastAPI server
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT}
