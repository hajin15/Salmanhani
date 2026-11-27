# 1단계: React 프론트엔드 빌드
FROM node:20-slim AS frontend-builder
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# 2단계: Python 백엔드 + 빌드된 프론트엔드 서빙
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=5000 \
    DB_PATH=/app/data/salmanhi.db

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && groupadd --system app \
    && useradd --system --gid app --create-home app \
    && mkdir -p /app/data \
    && chown -R app:app /app

COPY --chown=app:app . .
COPY --from=frontend-builder --chown=app:app /frontend/dist ./frontend/dist

USER app

EXPOSE 5000

CMD ["gunicorn", "--bind=0.0.0.0:5000", "--workers=2", "--threads=4", "--timeout=120", "--access-logfile=-", "--error-logfile=-", "app:app"]
