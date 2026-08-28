# Build context is the repo root (see docker-compose.yml), because this is
# an npm-workspaces monorepo and the server depends on packages/db.
FROM node:20-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app

COPY package.json ./
COPY packages/db/package.json packages/db/package.json
COPY apps/server/package.json apps/server/package.json
RUN npm install

COPY tsconfig.base.json ./
COPY packages/db packages/db
COPY apps/server apps/server

RUN npm run generate -w packages/db
RUN npm run build -w packages/db
RUN npm run build -w apps/server

FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/package.json package.json
COPY --from=builder /app/tsconfig.base.json tsconfig.base.json
COPY --from=builder /app/packages/db packages/db
COPY --from=builder /app/apps/server apps/server

WORKDIR /app/apps/server
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy --schema=/app/packages/db/prisma/schema.prisma && node dist/index.js"]
