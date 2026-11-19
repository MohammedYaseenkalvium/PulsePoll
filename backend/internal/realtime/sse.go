package realtime

import (
	"encoding/json"
	"fmt"
	"time"

	"pulsepoll-backend/internal/models"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

type SSEStreamer struct {
	pollCol *mongo.Collection
	redis   *RedisManager
}

func NewSSEStreamer(db *mongo.Database, rdb *RedisManager) *SSEStreamer {
	return &SSEStreamer{
		pollCol: db.Collection("polls"),
		redis:   rdb,
	}
}

// StreamPoll handles the SSE connection for a specific poll
func (s *SSEStreamer) StreamPoll(c *gin.Context) {
	pollIDStr := c.Param("id")
	pollObjID, err := primitive.ObjectIDFromHex(pollIDStr)
	if err != nil {
		c.JSON(400, gin.H{"error": "Invalid poll ID"})
		return
	}

	ctx := c.Request.Context()

	// Verify poll exists in MongoDB
	var poll models.Poll
	err = s.pollCol.FindOne(ctx, bson.M{"_id": pollObjID}).Decode(&poll)
	if err != nil {
		c.JSON(404, gin.H{"error": "Poll not found"})
		return
	}

	// Prepare SSE response headers
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("Transfer-Encoding", "chunked")
	c.Writer.Header().Set("X-Accel-Buffering", "no")
	c.Writer.Flush()

	// Ensure Redis has hydrated counts
	_ = s.redis.HydratePollCounts(ctx, poll.ID.Hex(), poll.Options)

	// Send initial state snapshot immediately
	counts, total, _ := s.redis.GetPollCounts(ctx, poll.ID.Hex())
	initialMsg := models.VoteStreamMessage{
		Type:         "initial",
		PollID:       poll.ID.Hex(),
		Status:       poll.Status,
		OptionCounts: counts,
		TotalVotes:   total,
		Timestamp:    time.Now().UnixMilli(),
	}
	if initBytes, err := json.Marshal(initialMsg); err == nil {
		_, _ = fmt.Fprintf(c.Writer, "event: initial\ndata: %s\n\n", string(initBytes))
		c.Writer.Flush()
	}

	// Subscribe to Redis Pub/Sub channel
	pubsub := s.redis.SubscribePollChannel(ctx, poll.ID.Hex())
	defer pubsub.Close()

	ch := pubsub.Channel()
	clientGone := c.Writer.CloseNotify()
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-clientGone:
			return
		case <-ctx.Done():
			return
		case <-ticker.C:
			// SSE comment to keep TCP connection alive
			if _, err := fmt.Fprintf(c.Writer, ": ping\n\n"); err != nil {
				return
			}
			c.Writer.Flush()
		case msg, ok := <-ch:
			if !ok {
				return
			}

			// Parse message to get event type
			var parsed models.VoteStreamMessage
			eventType := "vote_update"
			if err := json.Unmarshal([]byte(msg.Payload), &parsed); err == nil && parsed.Type != "" {
				eventType = parsed.Type
			}

			if _, err := fmt.Fprintf(c.Writer, "event: %s\ndata: %s\n\n", eventType, msg.Payload); err != nil {
				return
			}
			c.Writer.Flush()
		}
	}
}
