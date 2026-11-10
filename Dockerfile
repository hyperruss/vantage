FROM node:24-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund

COPY apps/ apps/
COPY design/vantage-logo.png design/
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules/ node_modules/
COPY --from=build /app/apps/api/package.json apps/api/
COPY --from=build /app/apps/api/dist/ apps/api/dist/
COPY --from=build /app/apps/web/dist/ apps/web/dist/
COPY db/migrations/ db/migrations/

USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/server.js"]
