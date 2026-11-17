FROM node:22.23.5-bookworm-slim AS node

FROM python:3.12.12-slim-bookworm AS dev
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 && rm -rf /var/lib/apt/lists/*
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm

FROM node AS client-build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN ["npm", "ci", "--ignore-scripts"]
COPY . .
RUN ["npm", "run", "typecheck"]
RUN ["npm", "run", "test:client"]
RUN ["npm", "run", "build"]

FROM python:3.12.12-slim-bookworm AS server-build
WORKDIR /app
COPY server/requirements.txt ./server/requirements.txt
RUN pip install --no-cache-dir --require-hashes --target=/dependencies -r server/requirements.txt
COPY server ./server
ENV PYTHONPATH=/dependencies
RUN ["python", "-m", "unittest", "discover", "-s", "server/tests", "-t", "."]

FROM python:3.12.12-slim-bookworm AS runtime
WORKDIR /app
ENV HOST=0.0.0.0 PORT=3001 PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY --from=server-build /dependencies /usr/local/lib/python3.12/site-packages
COPY --from=server-build /app/server ./server
COPY --from=client-build /app/dist ./dist
COPY LICENSE THIRD_PARTY_NOTICES.txt ./
USER 10001:10001
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:3001/api/health', timeout=3)"]
CMD ["python", "-m", "server"]
