FROM python:3.13-slim

WORKDIR /app

# Install system dependencies for Pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
    libjpeg62-turbo-dev \
    zlib1g-dev \
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
