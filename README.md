# PulsePoll

> High-throughput, real-time polling application powered by Go (Gin), MongoDB, Redis, and React 19 with GSAP origin-aware motion primitives and a Zero-FOUC semantic design system.

---

## 1. Monorepo Architecture & Folder Structure

```
PulsePoll/
├── backend/                        # Go (Gin) real-time API server
│   ├── cmd/
│   │   └── server/
│   │       └── main.go             # Application entrypoint, HTTP server & SPA static serving
│   ├── internal/
│   │   ├── config/                 # Environment-driven configuration
│   │   ├── handlers/               # Gin HTTP route controllers (Auth, Polls, Vote)
│   │   ├── middleware/             # JWT Auth and CORS middlewares
│   │   ├── models/                 # BSON & JSON domain entities (User, Poll, Vote)
│   │   └── realtime/               # Redis atomic counter & SSE Pub/Sub streamer
│   ├── go.mod
│   └── go.sum
├── frontend/                       # React 19 + TypeScript + Vite + Tailwind CSS
│   ├── src/
│   │   ├── components/             # Reusable UI components
│   │   │   ├── CreatePollModal.tsx # Multi-step origin-aware poll creation modal
│   │   │   └── LiveMonitorModal.tsx# Origin-aware live monitor modal
│   │   ├── context/
│   │   │   └── AuthContext.tsx     # JWT authentication & session state context
│   │   ├── lib/
│   │   │   └── api.ts              # Typed API client, SSE URL helpers & Demo Mode fallback
│   │   ├── motion/
│   │   │   ├── useOriginTransition.ts # Origin-aware GSAP motion hook
│   │   │   └── ThemeToggle.tsx        # GSAP sun/moon morphing toggle
│   │   ├── styles/
│   │   │   └── tokens.css          # Semantic CSS color tokens & theme variables
│   │   ├── views/
│   │   │   ├── AuthView.tsx           # Split-screen creator authentication & onboarding
│   │   │   ├── DashboardView.tsx      # Creator dashboard with GSAP collapsible sidebar
│   │   │   ├── LiveMonitorView.tsx    # Live presenter & monitor view with selective GSAP tweens
│   │   │   └── ParticipantVoteView.tsx# Mobile-first voting view with backend gating
│   │   ├── App.tsx                 # Client-side router & view orchestrator
│   │   └── main.tsx
│   ├── index.html                  # Zero-FOUC synchronous theme injection
│   ├── tailwind.config.js          # Token-mapped Tailwind configuration
│   ├── vite.config.ts              # Vite dev server with /api proxy to Go backend
│   └── package.json
├── docker-compose.yml              # Local MongoDB 7 and Redis 7 infrastructure
├── .gitignore
└── README.md
```

---

## 2. Key Architectural Decisions

### A. Real-Time Mechanics (Redis Doing Real Work)
- **Sub-Millisecond Atomic Vote Ingestion**: Vote submissions do not block on MongoDB writes. Real-time vote counts are executed as atomic Redis hash increments (`HINCRBY poll:{id}:counts {optionId} 1` and `HINCRBY poll:{id}:counts _total 1`).
- **Redis Pub/Sub Streaming via SSE**: When an atomic increment completes, the backend publishes the updated tally JSON to Redis channel `poll:{id}:updates`. The Go Gin SSE endpoint (`GET /api/polls/:id/stream`) subscribes to Redis Pub/Sub and streams live events to participants and presenter screens with zero page refresh.
- **Durable Audit Trail in MongoDB**: MongoDB stores permanent vote audit trails (`votes` collection) and durable poll definitions (`polls` collection). Cache misses in Redis automatically hydrate from MongoDB.
- **Server-Side Validation & Duplicate Prevention**:
  - Validates poll status (`open`), option existence, and single vs multiple choice constraints.
  - Prevents duplicate votes using a Redis Set (`poll:{id}:voters:{fingerprint}`) combined with MongoDB unique indexing.

### B. GSAP Selective Tweening & Motion Primitives
- **Selective GSAP Rendering**: In `LiveMonitorView.tsx`, previous option counts are tracked in a React `useRef`. When a Redis SSE event arrives, GSAP inspects which options changed and **only tweens the bars and `tabular-nums` percentages that actually received new votes**, eliminating wasteful DOM re-renders and glitchy animations.
- **Origin-Aware View Expansion (`useOriginTransition.ts`)**: Captures trigger elements' `getBoundingClientRect()` to compute relative `deltaX`, `deltaY`, and initial scale, projecting modals and views directly from the clicked button.
- **Accessibility & Reduced Motion**: All GSAP timelines check `prefers-reduced-motion` via `gsap.matchMedia()`, degrading to clean crossfades when reduced motion is preferred.

### C. Zero-FOUC Theme & Semantic Design Tokens
- **Zero-FOUC Head Script**: A synchronous script runs in `<head>` before browser paint, reading `localStorage.getItem('pulsepoll-theme')` or system `prefers-color-scheme`, preventing flash-of-unstyled-content.
- **Strict Semantic Tokens (`src/styles/tokens.css`)**: Zero hardcoded hex colors in components. All colors are mapped to CSS variables (`--primary-600`, `--bg-canvas`, `--bg-surface`, `--text-content`, `--error-600`, `--success-700`).

### D. Seamless Local Development & Production Serving
- **Local Dev Proxy**: Vite dev server proxies `/api` requests to `http://localhost:8080`, bypassing CORS during local development.
- **Production Static Serving**: The Go Gin server in `backend/cmd/server/main.go` automatically serves built static assets from `frontend/dist` with an SPA fallback (`r.NoRoute`), allowing single-binary or unified container deployment.
- **Resilient Fallback / Demo Mode**: If MongoDB or Redis are offline during local exploration, the frontend transparently falls back to an in-memory client-side demo mode with mock data and simulated live voting.

---

## 3. Client-Side Routing Reference

| Path | View Component | Description |
| :--- | :--- | :--- |
| `/` | `AuthView` / `DashboardView` | Creator login / registration or Creator dashboard if authenticated |
| `/poll/:id/live` | `LiveMonitorView` | Live presenter screen with real-time SSE stream, selective GSAP bar tweens, and status switch |
| `/vote/:shareSlug` | `ParticipantVoteView` | Mobile-first voter interface with backend-gated submission and live post-vote results |
| `/poll/:shareSlug` | `ParticipantVoteView` | Friendly alias for voter interface |

---

## 4. Environment Variables

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

## 5. Quickstart Guide

### 1. Start Infrastructure Containers (MongoDB + Redis)
```bash
docker compose up -d
```
Verify containers are running:
- **MongoDB 7**: `localhost:27017`
- **Redis 7**: `localhost:6379`

### 2. Run Go Backend
```bash
cd backend
go run ./cmd/server/main.go
```
The backend starts at `http://localhost:8080`.

Verify health check:
```bash
curl http://localhost:8080/api/health
```

### 3. Run React Frontend
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## 6. Verification & Production Build

### Frontend Production Build
```bash
cd frontend
npm run build
```
Build output is saved to `frontend/dist`.

### Backend Go Build
```bash
cd backend
go build ./...
go vet ./...
```

---

## 7. API Reference

### Authentication
- `POST /api/auth/register` — Register a creator (`email`, `username`, `password`)
- `POST /api/auth/login` — Authenticate creator and receive signed JWT token
- `GET /api/auth/me` — Retrieve authenticated creator profile (Bearer token required)

### Creator Poll Management (Protected)
- `POST /api/polls` — Create poll with 2–10 options, description, and settings
- `GET /api/polls` — List all polls belonging to the authenticated creator with live Redis tallies
- `PATCH /api/polls/:id/status` — Toggle poll status between `open` and `closed`
- `DELETE /api/polls/:id` — Delete poll from MongoDB and clean up Redis keys

### Public Voting & Real-Time SSE
- `GET /api/polls/s/:shareSlug` — Public poll metadata by short share slug with live Redis counts
- `GET /api/polls/:id` — Public poll metadata by ID with live Redis counts
- `POST /api/polls/:id/vote` — Submit vote with fingerprint duplicate prevention and atomic Redis increments
- `GET /api/polls/:id/stream` — Real-time Server-Sent Events (SSE) subscribed to Redis Pub/Sub

### System Health
- `GET /api/health` — Service readiness probe checking MongoDB and Redis connectivity
