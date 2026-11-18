# PulsePoll

> High-throughput, real-time polling application powered by Go, MongoDB, Redis, and React with GSAP origin-aware motion primitives and a Zero-FOUC semantic design system.

---

## 1. Monorepo Architecture & Folder Structure

```
PulsePoll/
├── backend/                        # Go (Gin) real-time API server
│   ├── cmd/
│   │   └── server/
│   │       └── main.go             # Application entrypoint & HTTP server lifecycle
│   ├── internal/
│   │   ├── config/                 # Environment-driven configuration
│   │   ├── handlers/               # Gin HTTP route controllers (Auth, Polls, SSE)
│   │   ├── middleware/             # JWT Auth and CORS middlewares
│   │   ├── models/                 # BSON & JSON domain entities (User, Poll, Vote)
│   │   └── realtime/               # Redis atomic counter & Pub/Sub manager
│   ├── go.mod
│   └── go.sum
├── frontend/                       # React 19 + TypeScript + Vite + Tailwind CSS
│   ├── src/
│   │   ├── motion/
│   │   │   ├── useOriginTransition.ts # Origin-aware GSAP motion hook
│   │   │   └── ThemeToggle.tsx        # GSAP sun/moon morphing toggle
│   │   ├── styles/
│   │   │   └── tokens.css          # Semantic CSS color tokens & theme variables
│   │   ├── App.tsx                 # Foundation preview & interactive motion demo
│   │   └── main.tsx
│   ├── index.html                  # Zero-FOUC synchronous theme injection
│   ├── tailwind.config.js          # Token-mapped Tailwind configuration
│   └── package.json
├── docker-compose.yml              # Local MongoDB 7 and Redis 7 containers
├── .gitignore
└── README.md
```

---

## 2. Architectural Decisions

### A. Real-Time Mechanics (Redis Doing Real Work)
- **Atomic Vote Ingestion**: Real-time vote counts never cause write lockups in MongoDB. Vote submissions issue pipeline transactions to Redis hashes (`poll:{id}:counts`) executing `HINCRBY` per selected option and `_total`.
- **Zero-Refresh Streaming**: Updates are immediately published to Redis channel `poll:{id}:updates`. The Go backend streams updates directly to connected web clients via Server-Sent Events (SSE) (`GET /api/polls/:id/stream`) with keep-alive heartbeats and zero page refreshes.
- **Persistence & Auditability**: MongoDB stores permanent vote audit trails (`votes` collection) and durable poll definitions (`polls` collection). An asynchronous worker synchronizes Redis counts back to MongoDB for long-term consistency.
- **Server-Side Validation & Duplicate Prevention**: Gin controllers validate that:
  - The poll exists and is currently in `open` status.
  - Every option ID submitted exists in the target poll.
  - Single-choice polls reject multiple selected option IDs.
  - Duplicate votes are blocked via user account ID (for authenticated users) or client voter fingerprint (for anonymous votes).

### B. Color Architecture & Zero-FOUC Theme
- **Zero-FOUC Script**: An inline synchronous `<script>` in `<head>` executes before initial browser paint, reading `localStorage.getItem('pulsepoll-theme')` with a fallback to `prefers-color-scheme`, immediately assigning `.light` or `.dark` to `<html>`.
- **Semantic Token Hierarchy (`tokens.css`)**:
  - **Primary (Electric Indigo)**: `50` (`#EEF2FF`) through `900` (`#312E81`), with `primary-500` (`#6366F1`) brand identity, `600` (`#4F46E5`) WCAG AA button fill, and `700` (`#4338CA`) hover.
  - **Neutral (Cool Slate-Zinc)**: `50` (`#F8FAFC`) through `900` (`#0F172A`) + `950` (`#09090B` dark canvas).
  - **Semantic Families**: Success Emerald (`500: #10B981`, `700: #047857` for `#FFFFFF` text), Warning Amber (`500: #F59E0B`), and Error Red (`500: #EF4444`, `600: #DC2626` for `#FFFFFF` text).
  - All tokens are exposed as CSS custom properties and wired into Tailwind CSS config (`bg-canvas`, `bg-surface`, `text-content`, etc.), completely avoiding hardcoded hex colors.

### C. Origin-Aware GSAP Motion Primitives
- **`useOriginTransition`**: Captures trigger elements' `getBoundingClientRect()`. Dynamically computes relative `deltaX`, `deltaY`, and initial scale to project modals, drawers, or views directly out of the clicked button using GPU-composited transforms (`x`, `y`, `scale`, `opacity`).
- **Reduced-Motion Compliance**: Handled through `gsap.matchMedia()`, gracefully degrading to instantaneous crossfades when `(prefers-reduced-motion: reduce)` is detected.
- **Clean Teardown**: Uses `gsap.context()` for automatic cleanup and leak prevention in React component lifecycles.

---

## 3. Environment Variables

### Backend (`/backend`)

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `PORT` | `8080` | Port for the Go Gin HTTP and SSE server |
| `MONGO_URI` | `mongodb://localhost:27017` | MongoDB connection URI |
| `MONGO_DB` | `pulsepoll` | Target MongoDB database name |
| `REDIS_ADDR` | `localhost:6379` | Redis host and port |
| `REDIS_PASSWORD` | `""` | Redis authentication password |
| `REDIS_DB` | `0` | Redis logical database index |
| `JWT_SECRET` | `pulsepoll-secret-key-change-in-production-2026` | Secret key for signing JWT tokens |
| `JWT_EXPIRY_HOURS` | `72` | Token validity duration in hours |
| `CORS_ALLOW_ORIGIN` | `*` | Allowed CORS origin (e.g. `http://localhost:5173`) |

---

## 4. Quickstart Guide

### 1. Start Infrastructure Containers
```bash
docker compose up -d
```
This spins up:
- **MongoDB**: `localhost:27017`
- **Redis**: `localhost:6379`

### 2. Run Go Backend
```bash
cd backend
go run ./cmd/server/main.go
```
The server will start at `http://localhost:8080`.

### 3. Run Frontend
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` to interact with the Zero-FOUC theme toggle and origin-aware motion test.

---

## 5. API Reference

### Authentication
- `POST /api/auth/register` — Register a new user (`email`, `username`, `password`)
- `POST /api/auth/login` — Authenticate user and receive JWT
- `GET /api/auth/me` — Retrieve authenticated user profile (Bearer token required)

### Polls & Realtime
- `POST /api/polls` — Create a poll with questions and options (Bearer token required)
- `GET /api/polls/:id` — Retrieve poll details with real-time Redis counts
- `POST /api/polls/:id/vote` — Submit a vote with option validation and duplicate prevention
- `GET /api/polls/:id/stream` — Connect to Server-Sent Events (SSE) live updates channel
- `PATCH /api/polls/:id` — Update poll status (open/closed) (Creator token required)

### Health
- `GET /api/health` — Service readiness probe
