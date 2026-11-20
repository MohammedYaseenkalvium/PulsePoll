# syntax=docker/dockerfile:1
# PulsePoll — single production image: React SPA + Go (Gin) API on port 8080.

# ---------- Stage 1: build the React frontend ----------
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY frontend/ ./
# Same-origin API by default (Go serves both SPA and /api). Override for split deployments.
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

# ---------- Stage 2: build the Go backend ----------
# go.mod declares go 1.27.4; official golang images pin GOTOOLCHAIN=local, so the
# builder must be >= 1.27 (a 1.22 image would refuse to build this module).
FROM golang:1.27-alpine AS backend-builder
WORKDIR /app/backend

COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

# ---------- Stage 3: minimal runtime ----------
FROM alpine:3.20
WORKDIR /app

# ca-certificates: TLS to MongoDB Atlas / Upstash Redis. wget (busybox) is used by HEALTHCHECK.
RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -S pulsepoll && adduser -S -G pulsepoll pulsepoll

COPY --from=backend-builder /out/server /app/server
# main.go resolves ./frontend/dist relative to WORKDIR /app
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

ENV GIN_MODE=release \
    PORT=8080

USER pulsepoll
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1

ENTRYPOINT ["/app/server"]
