package realtime

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"pulsepoll-backend/internal/config"
	"pulsepoll-backend/internal/models"

	"github.com/redis/go-redis/v9"
)

type RedisManager struct {
	Client *redis.Client
}

func NewRedisManager(cfg *config.Config) (*RedisManager, error) {
	rdb := redis.NewClient(&redis.Options{
		Addr:     cfg.RedisAddr,
		Password: cfg.RedisPassword,
		DB:       cfg.RedisDB,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	// Ping is optional on boot so dev mode doesn't crash if Redis is starting up
	_ = rdb.Ping(ctx)

	return &RedisManager{Client: rdb}, nil
}

func PollCountsKey(pollID string) string {
	return fmt.Sprintf("poll:%s:counts", pollID)
}

func PollChannelKey(pollID string) string {
	return fmt.Sprintf("poll:%s:updates", pollID)
}

// InitPollCounts sets default 0 for options if the hash does not exist yet
func (m *RedisManager) InitPollCounts(ctx context.Context, pollID string, optionIDs []string) error {
	key := PollCountsKey(pollID)
	pipe := m.Client.Pipeline()
	for _, optID := range optionIDs {
		pipe.HSetNX(ctx, key, optID, 0)
	}
	pipe.HSetNX(ctx, key, "_total", 0)
	_, err := pipe.Exec(ctx)
	return err
}

// IncrementVotes atomically increments votes in Redis hash and publishes live update
func (m *RedisManager) IncrementVotes(ctx context.Context, pollID string, optionIDs []string) (*models.VoteStreamMessage, error) {
	key := PollCountsKey(pollID)
	pipe := m.Client.TxPipeline()

	for _, optID := range optionIDs {
		pipe.HIncrBy(ctx, key, optID, 1)
	}
	pipe.HIncrBy(ctx, key, "_total", int64(len(optionIDs)))

	_, err := pipe.Exec(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to increment redis counts: %w", err)
	}

	// Fetch latest counts
	countsMap, err := m.Client.HGetAll(ctx, key).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to fetch updated counts: %w", err)
	}

	parsedCounts := make(map[string]int64)
	var totalVotes int64 = 0

	for k, v := range countsMap {
		val, _ := strconv.ParseInt(v, 10, 64)
		if k == "_total" {
			totalVotes = val
		} else {
			parsedCounts[k] = val
		}
	}

	updateMsg := &models.VoteStreamMessage{
		PollID:       pollID,
		OptionCounts: parsedCounts,
		TotalVotes:   totalVotes,
		Timestamp:    time.Now().UnixMilli(),
	}

	// Broadcast to subscribers via Redis Pub/Sub
	payload, err := json.Marshal(updateMsg)
	if err == nil {
		m.Client.Publish(ctx, PollChannelKey(pollID), payload)
	}

	return updateMsg, nil
}

// GetPollCounts retrieves the current counts for a poll from Redis
func (m *RedisManager) GetPollCounts(ctx context.Context, pollID string) (map[string]int64, int64, error) {
	key := PollCountsKey(pollID)
	countsMap, err := m.Client.HGetAll(ctx, key).Result()
	if err != nil {
		return nil, 0, err
	}

	parsedCounts := make(map[string]int64)
	var totalVotes int64 = 0

	for k, v := range countsMap {
		val, _ := strconv.ParseInt(v, 10, 64)
		if k == "_total" {
			totalVotes = val
		} else {
			parsedCounts[k] = val
		}
	}

	return parsedCounts, totalVotes, nil
}

// SubscribePollChannel returns a PubSub subscription for live poll events
func (m *RedisManager) SubscribePollChannel(ctx context.Context, pollID string) *redis.PubSub {
	return m.Client.Subscribe(ctx, PollChannelKey(pollID))
}
