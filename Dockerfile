FROM node:22-bookworm-slim AS frontend-build

WORKDIR /frontend
COPY Frontend/Front/package.json Frontend/Front/package-lock.json ./
RUN npm ci
COPY Frontend/Front/ ./
ARG VITE_API_URL=/api/
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    CHROMA_DB_PATH=/app/Collections \
    DISCUSSIONS_PATH=/app/data/discussions.json

WORKDIR /app

COPY requirements-docker.txt ./
RUN pip install --no-cache-dir -r requirements-docker.txt

COPY Backend/ ./Backend/
COPY Collections/ ./Collections/
COPY --from=frontend-build /frontend/dist/ ./static/

RUN python -c "from transformers import BertTokenizer; BertTokenizer.from_pretrained('bert-base-multilingual-cased')" \
    && python -c "from chromadb.utils.embedding_functions import DefaultEmbeddingFunction; DefaultEmbeddingFunction()(['cache warmup'])" \
    && mkdir -p /app/data

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD python -c "from urllib.request import urlopen; urlopen('http://127.0.0.1:8000/health', timeout=3)" || exit 1

CMD ["uvicorn", "Backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
