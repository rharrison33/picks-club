FROM node:24-bookworm-slim AS frontend
WORKDIR /build/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --include=dev
COPY server/ ./
COPY --from=frontend /build/client/dist /app/client/dist
ENV NODE_ENV=production SERVE_CLIENT=true
EXPOSE 3001
CMD ["npm", "start"]
