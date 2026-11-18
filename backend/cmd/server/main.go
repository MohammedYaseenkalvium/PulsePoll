package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
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

	log.Printf("[PulsePoll] Starting backend on port %s", cfg.Port)

	// 1. Connect to MongoDB
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	mongoClient, err := mongo.Connect(ctx, options.Client().ApplyURI(cfg.MongoURI))
	if err != nil {
		log.Printf("[PulsePoll] Warning: MongoDB initial connection failed: %v", err)
	} else {
		// Ping MongoDB
		if err := mongoClient.Ping(ctx, nil); err != nil {
			log.Printf("[PulsePoll] Warning: MongoDB ping failed: %v", err)
		} else {
			log.Printf("[PulsePoll] Connected to MongoDB database: %s", cfg.MongoDBName)
		}
	}
	db := mongoClient.Database(cfg.MongoDBName)

	// 2. Connect to Redis
	redisManager, err := realtime.NewRedisManager(cfg)
	if err != nil {
		log.Printf("[PulsePoll] Warning: Redis initialization error: %v", err)
	} else {
		log.Printf("[PulsePoll] Redis client initialized (Addr: %s)", cfg.RedisAddr)
	}

	// 3. Initialize Handlers
	authHandler := handlers.NewAuthHandler(db, cfg)
	pollHandler := handlers.NewPollHandler(db, redisManager)

	// 4. Gin Router Setup
	r := gin.Default()
	r.Use(middleware.CORSMiddleware(cfg.CORSAllowOrigin))

	// Health Check
	r.GET("/api/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":    "healthy",
			"service":   "pulsepoll-backend",
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		})
	})

	// Auth Routes
	authRoutes := r.Group("/api/auth")
	{
		authRoutes.POST("/register", authHandler.Register)
		authRoutes.POST("/login", authHandler.Login)
		authRoutes.GET("/me", middleware.AuthMiddleware(cfg.JWTSecret), authHandler.Me)
	}

	// Poll Routes
	pollRoutes := r.Group("/api/polls")
	{
		// Public or optionally authenticated
		pollRoutes.GET("/:id", pollHandler.GetPoll)
		pollRoutes.GET("/:id/stream", pollHandler.StreamPoll)
		pollRoutes.POST("/:id/vote", middleware.OptionalAuthMiddleware(cfg.JWTSecret), pollHandler.CastVote)

		// Protected by JWT Auth Middleware
		protectedPolls := pollRoutes.Group("")
		protectedPolls.Use(middleware.AuthMiddleware(cfg.JWTSecret))
		{
			protectedPolls.POST("", pollHandler.CreatePoll)
			protectedPolls.PATCH("/:id", pollHandler.UpdatePoll)
		}
	}

	srv := &http.Server{
		Addr:    fmt.Sprintf(":%s", cfg.Port),
		Handler: r,
	}

	// Graceful shutdown
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[PulsePoll] Server failed: %v", err)
		}
	}()

	log.Printf("[PulsePoll] Server listening on http://localhost:%s", cfg.Port)

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("[PulsePoll] Shutting down server gracefully...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("[PulsePoll] Server forced to shutdown: %v", err)
	}
	if err := mongoClient.Disconnect(shutdownCtx); err != nil {
		log.Printf("[PulsePoll] Error disconnecting Mongo: %v", err)
	}

	log.Println("[PulsePoll] Server stopped cleanly")
}
