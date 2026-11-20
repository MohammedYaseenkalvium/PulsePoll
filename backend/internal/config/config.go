package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	Port            string
	MongoURI        string
	MongoDBName     string
	RedisURL        string // Optional full URL (redis:// or rediss:// for TLS). Takes precedence over Addr/Password.
	RedisAddr       string
	RedisUsername   string
	RedisPassword   string
	RedisDB         int
	RedisTLS        bool
	JWTSecret       string
	JWTExpiry       time.Duration
	CORSAllowOrigin string
	StaticDir       string // Optional override for the built frontend directory
}

func LoadConfig() *Config {
	port := getEnv("PORT", "8080")
	mongoURI := getEnv("MONGO_URI", "mongodb://localhost:27017")
	mongoDBName := getEnv("MONGO_DB", "pulsepoll")
	redisAddr := getEnv("REDIS_ADDR", "localhost:6379")
	redisPassword := getEnv("REDIS_PASSWORD", "")
	redisDBStr := getEnv("REDIS_DB", "0")
	redisDB, err := strconv.Atoi(redisDBStr)
	if err != nil {
		redisDB = 0
	}

	jwtSecret := getEnv("JWT_SECRET", "pulsepoll-secret-key-change-in-production-2026")
	jwtExpiryHoursStr := getEnv("JWT_EXPIRY_HOURS", "72")
	jwtExpiryHours, err := strconv.Atoi(jwtExpiryHoursStr)
	if err != nil {
		jwtExpiryHours = 72
	}

	corsAllowOrigin := getEnv("CORS_ALLOW_ORIGIN", "*")

	redisTLS, err := strconv.ParseBool(getEnv("REDIS_TLS", "false"))
	if err != nil {
		redisTLS = false
	}

	return &Config{
		Port:            port,
		MongoURI:        mongoURI,
		MongoDBName:     mongoDBName,
		RedisURL:        getEnv("REDIS_URL", ""),
		RedisAddr:       redisAddr,
		RedisUsername:   getEnv("REDIS_USERNAME", ""),
		RedisPassword:   redisPassword,
		RedisDB:         redisDB,
		RedisTLS:        redisTLS,
		JWTSecret:       jwtSecret,
		JWTExpiry:       time.Duration(jwtExpiryHours) * time.Hour,
		CORSAllowOrigin: corsAllowOrigin,
		StaticDir:       getEnv("STATIC_DIR", ""),
	}
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}
