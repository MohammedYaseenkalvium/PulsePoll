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

	_ = rdb.Ping(ctx)

	return &RedisManager{Client: rdb}, nil
}

func PollCountsKey(pollID string) string {
	return fmt.Sprintf("poll:%s:counts", pollID)
}

func PollChannelKey(pollID string) string {
	return fmt.Sprintf("poll:%s:updates", pollID)
}

func PollVotersKey(pollID string) string {
	return fmt.Sprintf("poll:%s:voters", pollID)
}

func PollVoterFingerprintKey(pollID string, voterFingerprint string) string {
	return fmt.Sprintf("poll:%s:voters:%s", pollID, voterFingerprint)
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

// HydratePollCounts populates Redis counts from MongoDB if Redis counts key is missing
func (m *RedisManager) HydratePollCounts(ctx context.Context, pollID string, options []models.PollOption) error {
	key := PollCountsKey(pollID)
	exists, err := m.Client.Exists(ctx, key).Result()
	if err != nil {
		return err
	}
	if exists > 0 {
		return nil
	}

	pipe := m.Client.Pipeline()
	var total int64 = 0
	for _, opt := range options {
		pipe.HSet(ctx, key, opt.ID, opt.VoteCount)
		total += opt.VoteCount
	}
	pipe.HSet(ctx, key, "_total", total)
	_, err = pipe.Exec(ctx)
	return err
}

// CheckAndSetVoter checks if a voter has already voted and records them atomically
// Returns true if voter was added (has not voted yet), false if duplicate
func (m *RedisManager) CheckAndSetVoter(ctx context.Context, pollID string, voterFingerprint string) (bool, error) {
	// First check individual voter key (poll:{id}:voters:{fingerprint})
	voterKey := PollVoterFingerprintKey(pollID, voterFingerprint)
	set, err := m.Client.SetNX(ctx, voterKey, "1", 0).Result()
	if err != nil {
		return false, err
	}
	if !set {
		return false, nil
	}

	// Also add to set of all voters for this poll
	m.Client.SAdd(ctx, PollVotersKey(pollID), voterFingerprint)
	return true, nil
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
		Type:         "vote_update",
		PollID:       pollID,
		Status:       models.PollStatusOpen,
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

// PublishStatusChange broadcasts status change events to subscribers
func (m *RedisManager) PublishStatusChange(ctx context.Context, pollID string, status models.PollStatus) error {
	counts, total, _ := m.GetPollCounts(ctx, pollID)

	msg := models.VoteStreamMessage{
		Type:         "status_change",
		PollID:       pollID,
		Status:       status,
		OptionCounts: counts,
		TotalVotes:   total,
		Timestamp:    time.Now().UnixMilli(),
	}

	payload, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	return m.Client.Publish(ctx, PollChannelKey(pollID), payload).Err()
}

// GetPollCounts retrieves current counts for a poll from Redis
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

// DeletePollData removes all Redis keys associated with a poll
func (m *RedisManager) DeletePollData(ctx context.Context, pollID string) error {
	voters, _ := m.Client.SMembers(ctx, PollVotersKey(pollID)).Result()
	keysToDelete := []string{
		PollCountsKey(pollID),
		PollVotersKey(pollID),
	}
	for _, v := range voters {
		keysToDelete = append(keysToDelete, PollVoterFingerprintKey(pollID, v))
	}

	return m.Client.Del(ctx, keysToDelete...).Err()
}

// SubscribePollChannel returns a PubSub subscription for live poll events
func (m *RedisManager) SubscribePollChannel(ctx context.Context, pollID string) *redis.PubSub {
	return m.Client.Subscribe(ctx, PollChannelKey(pollID))
}
