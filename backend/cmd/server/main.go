package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"pulsepoll-backend/internal/config"
	"pulsepoll-backend/internal/handlers"
	"pulsepoll-backend/internal/middleware"
	"pulsepoll-backend/internal/realtime"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func main() {
	cfg := config.LoadConfig()

	log.Printf("[PulsePoll] Initializing backend service on port %s...", cfg.Port)

	// 1. Connect to MongoDB (fail-fast timeout of 2s so requests don't hang if Mongo is down)
	mongoCtx, mongoCancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer mongoCancel()

	mongoClient, err := mongo.Connect(mongoCtx, options.Client().ApplyURI(cfg.MongoURI).SetServerSelectionTimeout(2*time.Second))
	if err != nil {
		log.Printf("[PulsePoll] Warning: MongoDB initial connection error: %v", err)
	} else {
		if pingErr := mongoClient.Ping(mongoCtx, nil); pingErr != nil {
			log.Printf("[PulsePoll] Warning: MongoDB ping failed: %v", pingErr)
		} else {
			log.Printf("[PulsePoll] Connected to MongoDB database: %s", cfg.MongoDBName)
		}
	}
	db := mongoClient.Database(cfg.MongoDBName)

	// 2. Connect to Redis
	redisManager, err := realtime.NewRedisManager(cfg)
	if err != nil {
		log.Fatalf("[PulsePoll] Invalid Redis configuration: %v", err)
	}
	log.Printf("[PulsePoll] Redis client initialized")

	// 3. Initialize Handlers & Streamers
	authHandler := handlers.NewAuthHandler(db, cfg)
	pollsHandler := handlers.NewPollsHandler(db, redisManager)
	voteHandler := handlers.NewVoteHandler(db, redisManager)
	sseStreamer := realtime.NewSSEStreamer(db, redisManager)

	// 4. Gin Engine Setup
	r := gin.Default()
	r.Use(middleware.CORSMiddleware(cfg.CORSAllowOrigin))

	// Health Check with live MongoDB and Redis ping checks
	r.GET("/api/health", func(c *gin.Context) {
		hCtx, hCancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
		defer hCancel()

		mongoStatus := "connected"
		if mongoErr := mongoClient.Ping(hCtx, nil); mongoErr != nil {
			mongoStatus = fmt.Sprintf("unreachable: %v", mongoErr)
		}

		redisStatus := "connected"
		if redisErr := redisManager.Client.Ping(hCtx).Err(); redisErr != nil {
			redisStatus = fmt.Sprintf("unreachable: %v", redisErr)
		}

		overall := "healthy"
		if mongoStatus != "connected" || redisStatus != "connected" {
			overall = "degraded"
		}

		c.JSON(http.StatusOK, gin.H{
			"status":    overall,
			"service":   "pulsepoll-backend",
			"timestamp": time.Now().UTC().Format(time.RFC3339),
			"database": gin.H{
				"mongodb": mongoStatus,
				"redis":   redisStatus,
			},
		})
	})

	// Auth Routes
	authRoutes := r.Group("/api/auth")
	{
		authRoutes.POST("/register", authHandler.Register)
		authRoutes.POST("/login", authHandler.Login)
		authRoutes.GET("/me", middleware.AuthMiddleware(cfg.JWTSecret), authHandler.Me)
	}

	// Polls Routes
	pollsRoutes := r.Group("/api/polls")
	{
		// Public endpoints: view poll by slug or ID, cast vote, and SSE stream
		pollsRoutes.GET("/s/:shareSlug", voteHandler.GetPollByShareSlug)
		pollsRoutes.GET("/:id", voteHandler.GetPollByID)
		pollsRoutes.GET("/:id/stream", sseStreamer.StreamPoll)
		pollsRoutes.POST("/:id/vote", middleware.OptionalAuthMiddleware(cfg.JWTSecret), voteHandler.CastVote)

		// Creator endpoints: protected by JWT Auth Middleware
		creatorRoutes := pollsRoutes.Group("")
		creatorRoutes.Use(middleware.AuthMiddleware(cfg.JWTSecret))
		{
			creatorRoutes.POST("", pollsHandler.CreatePoll)
			creatorRoutes.GET("", pollsHandler.GetMyPolls)
			creatorRoutes.PATCH("/:id/status", pollsHandler.UpdatePollStatus)
			creatorRoutes.DELETE("/:id", pollsHandler.DeletePoll)
		}
	}

	// 5. Production Static Frontend Serving & SPA Fallback (when a built dist exists).
	// Resolution order: STATIC_DIR env -> ./frontend/dist (Docker WORKDIR /app) ->
	// ../frontend/dist (running from /backend locally) -> ./dist.
	if distDir := resolveStaticDir(cfg.StaticDir); distDir != "" {
		log.Printf("[PulsePoll] Serving static frontend from %s", distDir)
		indexFile := filepath.Join(distDir, "index.html")

		r.NoRoute(func(c *gin.Context) {
			reqPath := c.Request.URL.Path
			if strings.HasPrefix(reqPath, "/api") {
				c.JSON(http.StatusNotFound, gin.H{"error": "Endpoint not found"})
				return
			}
			if c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead {
				c.Status(http.StatusNotFound)
				return
			}
			// Serve real files (assets, favicon, etc.); path.Clean on a rooted path prevents traversal.
			candidate := filepath.Join(distDir, filepath.FromSlash(path.Clean("/"+reqPath)))
			if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
				if strings.HasPrefix(reqPath, "/assets/") {
					c.Header("Cache-Control", "public, max-age=31536000, immutable")
				}
				c.File(candidate)
				return
			}
			// SPA fallback for client-side routes (/vote/:slug, /poll/:id/live, ...)
			c.Header("Cache-Control", "no-cache")
			c.File(indexFile)
		})
	} else {
		log.Printf("[PulsePoll] No built frontend found; running API-only (use Vite dev server on :5173)")
	}

	srv := &http.Server{
		Addr:    fmt.Sprintf(":%s", cfg.Port),
		Handler: r,
	}

	// Graceful server startup
	go func() {
		log.Printf("[PulsePoll] Server listening at http://localhost:%s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[PulsePoll] Server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("[PulsePoll] Gracefully shutting down...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("[PulsePoll] Forced shutdown: %v", err)
	}
	if err := mongoClient.Disconnect(shutdownCtx); err != nil {
		log.Printf("[PulsePoll] MongoDB disconnect error: %v", err)
	}

	log.Println("[PulsePoll] Server exited cleanly")
}

// resolveStaticDir returns the first directory containing a built index.html.
func resolveStaticDir(override string) string {
	candidates := []string{"./frontend/dist", "../frontend/dist", "./dist"}
	if override != "" {
		candidates = []string{override}
	}
	for _, dir := range candidates {
		if info, err := os.Stat(filepath.Join(dir, "index.html")); err == nil && !info.IsDir() {
			if abs, err := filepath.Abs(dir); err == nil {
				return abs
			}
			return dir
		}
	}
	return ""
}
