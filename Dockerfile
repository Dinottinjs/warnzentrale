# ── Feuerwehr Warnzentrale - Docker Image ─────────────────────────────────
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies (for psutil and sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libffi-dev \
    libssl-dev \
    curl \
    iputils-ping \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first (Docker layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY . .

# Create directories for uploads and persistent data
RUN mkdir -p /app/static/uploads /app/data

# Expose the Flask/SocketIO port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:5000/ || exit 1

# Run as non-root user for security
RUN adduser --disabled-password --gecos '' warnzentrale && \
    chown -R warnzentrale:warnzentrale /app
USER warnzentrale

# Start the application
CMD ["python", "app.py"]
