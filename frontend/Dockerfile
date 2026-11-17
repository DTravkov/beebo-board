FROM node:22.23.5-bookworm-slim AS build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json frontend/.npmrc ./
RUN npm install --global npm@11.10.0 && npm ci --ignore-scripts
COPY LICENSE THIRD_PARTY_NOTICES.txt /app/
COPY frontend/tsconfig.json frontend/vite.config.ts frontend/index.html ./
COPY frontend/public ./public
COPY frontend/src ./src
RUN npm run build

FROM caddy:2.11.9-alpine AS runtime
COPY --from=build /app/frontend/dist /srv
COPY frontend/Caddyfile /etc/caddy/Caddyfile
EXPOSE 80 443
