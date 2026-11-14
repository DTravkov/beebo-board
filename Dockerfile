FROM node:22.23.5-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN ["npm", "ci", "--ignore-scripts"]
COPY . .
RUN ["npm", "run", "check"]
RUN ["npm", "prune", "--omit=dev", "--ignore-scripts"]

FROM node:22.23.5-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/package.json /app/package-lock.json /app/LICENSE /app/THIRD_PARTY_NOTICES.txt ./
USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 CMD ["node", "--input-type=module", "-e", "fetch('http://127.0.0.1:3001/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "dist-server/index.js"]
