FROM python:3.12.12-slim-bookworm AS dependencies
COPY backend/requirements.txt /requirements.txt
RUN python -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir --require-hashes -r /requirements.txt

FROM python:3.12.12-slim-bookworm AS runtime
WORKDIR /app
ENV PATH="/opt/venv/bin:$PATH" PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY --from=dependencies /opt/venv /opt/venv
COPY backend/src ./backend/src
COPY LICENSE THIRD_PARTY_NOTICES.txt ./
USER 10001:10001
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:3001/api/health', timeout=3)"]
CMD ["uvicorn", "backend.src.main:app", "--host", "0.0.0.0", "--port", "3001", "--no-access-log", "--no-proxy-headers", "--ws", "websockets", "--ws-max-size", "32768", "--ws-max-queue", "16", "--ws-per-message-deflate", "false", "--timeout-graceful-shutdown", "5", "--h11-max-incomplete-event-size", "16384"]
