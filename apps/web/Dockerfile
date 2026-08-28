# Build context is the repo root (npm workspaces monorepo).
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm install

COPY apps/web apps/web
ARG VITE_API_BASE_URL=http://localhost:4000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build -w apps/web

FROM nginx:alpine
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
