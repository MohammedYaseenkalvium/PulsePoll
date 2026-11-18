package handlers

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"pulsepoll-backend/internal/models"
	"pulsepoll-backend/internal/realtime"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

type PollHandler struct {
	pollCol *mongo.Collection
	voteCol *mongo.Collection
	redis   *realtime.RedisManager
}

func NewPollHandler(db *mongo.Database, rdb *realtime.RedisManager) *PollHandler {
	return &PollHandler{
		pollCol: db.Collection("polls"),
		voteCol: db.Collection("votes"),
		redis:   rdb,
	}
}

func generateShareSlug() string {
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func (h *PollHandler) CreatePoll(c *gin.Context) {
	userIDStr, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication required to create a poll"})
		return
	}

	creatorID, err := primitive.ObjectIDFromHex(userIDStr.(string))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid creator ID"})
		return
	}

	var input models.CreatePollInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Validation failed", "details": err.Error()})
		return
	}

	// Validate options have unique non-empty text
	optSeen := make(map[string]bool)
	var options []models.PollOption
	var optionIDs []string

	for _, opt := range input.Options {
		trimmed := strings.TrimSpace(opt.Text)
		if trimmed == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Option text cannot be empty"})
			return
		}
		if optSeen[strings.ToLower(trimmed)] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Poll options must be distinct"})
			return
		}
		optSeen[strings.ToLower(trimmed)] = true

		optID := uuid.New().String()
		options = append(options, models.PollOption{
			ID:        optID,
			Text:      trimmed,
			VoteCount: 0,
		})
		optionIDs = append(optionIDs, optID)
	}

	now := time.Now()
	newPoll := models.Poll{
		ID:            primitive.NewObjectID(),
		Question:      strings.TrimSpace(input.Question),
		Description:   strings.TrimSpace(input.Description),
		Options:       options,
		Status:        models.PollStatusOpen,
		AllowMultiple: input.AllowMultiple,
		CreatorID:     creatorID,
		ShareSlug:     generateShareSlug(),
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	_, err = h.pollCol.InsertOne(ctx, newPoll)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create poll"})
		return
	}

	// Initialize atomic count structures in Redis
	_ = h.redis.InitPollCounts(ctx, newPoll.ID.Hex(), optionIDs)

	c.JSON(http.StatusCreated, newPoll)
}

func (h *PollHandler) GetPoll(c *gin.Context) {
	idOrSlug := c.Param("id")
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var filter bson.M
	if objID, err := primitive.ObjectIDFromHex(idOrSlug); err == nil {
		filter = bson.M{"_id": objID}
	} else {
		filter = bson.M{"share_slug": idOrSlug}
	}

	var poll models.Poll
	err := h.pollCol.FindOne(ctx, filter).Decode(&poll)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			c.JSON(http.StatusNotFound, gin.H{"error": "Poll not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error querying poll"})
		return
	}

	// Blend with real-time Redis counts if present
	counts, _, err := h.redis.GetPollCounts(ctx, poll.ID.Hex())
	if err == nil && len(counts) > 0 {
		for i := range poll.Options {
			if cnt, ok := counts[poll.Options[i].ID]; ok {
				poll.Options[i].VoteCount = cnt
			}
		}
	}

	c.JSON(http.StatusOK, poll)
}

func (h *PollHandler) CastVote(c *gin.Context) {
	pollIDStr := c.Param("id")
	pollObjID, err := primitive.ObjectIDFromHex(pollIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid poll ID"})
		return
	}

	var input models.CastVoteInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Validation failed", "details": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 7*time.Second)
	defer cancel()

	// 1. Verify poll exists and is open
	var poll models.Poll
	err = h.pollCol.FindOne(ctx, bson.M{"_id": pollObjID}).Decode(&poll)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			c.JSON(http.StatusNotFound, gin.H{"error": "Poll not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error checking poll"})
		return
	}

	if poll.Status != models.PollStatusOpen {
		c.JSON(http.StatusForbidden, gin.H{"error": "This poll is closed and no longer accepting votes"})
		return
	}

	// 2. Validate multiple choice setting
	if !poll.AllowMultiple && len(input.OptionIDs) > 1 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "This poll allows only a single option selection"})
		return
	}

	// 3. Verify all selected option IDs exist in this poll
	validOptionIDs := make(map[string]bool)
	for _, opt := range poll.Options {
		validOptionIDs[opt.ID] = true
	}
	for _, optID := range input.OptionIDs {
		if !validOptionIDs[optID] {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Invalid option ID: %s", optID)})
			return
		}
	}

	// 4. Duplicate-vote prevention
	clientIP := c.ClientIP()
	var userObjID *primitive.ObjectID
	if uidVal, exists := c.Get("userID"); exists {
		if uid, err := primitive.ObjectIDFromHex(uidVal.(string)); err == nil {
			userObjID = &uid
		}
	}

	dupFilter := bson.M{
		"poll_id": pollObjID,
		"$or": []bson.M{
			{"voter_fingerprint": input.VoterFingerprint},
		},
	}
	if userObjID != nil {
		dupFilter["$or"] = append(dupFilter["$or"].([]bson.M), bson.M{"user_id": userObjID})
	}

	existingCount, err := h.voteCol.CountDocuments(ctx, dupFilter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error checking duplicate vote"})
		return
	}
	if existingCount > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "Duplicate vote detected. You have already cast your vote on this poll."})
		return
	}

	// 5. Atomic increment in Redis & broadcast to Pub/Sub
	streamMsg, err := h.redis.IncrementVotes(ctx, poll.ID.Hex(), input.OptionIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to record vote counts", "details": err.Error()})
		return
	}

	// 6. Record vote in MongoDB
	newVote := models.Vote{
		ID:               primitive.NewObjectID(),
		PollID:           pollObjID,
		OptionIDs:        input.OptionIDs,
		UserID:           userObjID,
		VoterFingerprint: input.VoterFingerprint,
		IPAddress:        clientIP,
		CreatedAt:        time.Now(),
	}
	_, _ = h.voteCol.InsertOne(ctx, newVote)

	// Async sync vote counts to Mongo poll document
	go func(pID primitive.ObjectID, counts map[string]int64) {
		bgCtx, bgCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer bgCancel()
		for optID, count := range counts {
			_, _ = h.pollCol.UpdateOne(
				bgCtx,
				bson.M{"_id": pID, "options.id": optID},
				bson.M{"$set": bson.M{"options.$.vote_count": count, "updated_at": time.Now()}},
			)
		}
	}(pollObjID, streamMsg.OptionCounts)

	c.JSON(http.StatusOK, gin.H{
		"message":      "Vote successfully cast",
		"optionCounts": streamMsg.OptionCounts,
		"totalVotes":   streamMsg.TotalVotes,
	})
}

// StreamPoll serves Server-Sent Events (SSE) subscribed to Redis Pub/Sub
func (h *PollHandler) StreamPoll(c *gin.Context) {
	pollIDStr := c.Param("id")
	pollObjID, err := primitive.ObjectIDFromHex(pollIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid poll ID"})
		return
	}

	// Verify poll exists
	ctx := c.Request.Context()
	var poll models.Poll
	err = h.pollCol.FindOne(ctx, bson.M{"_id": pollObjID}).Decode(&poll)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Poll not found"})
		return
	}

	// Set SSE response headers
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("Transfer-Encoding", "chunked")
	c.Writer.Header().Set("X-Accel-Buffering", "no")
	c.Writer.Flush()

	// 1. Send initial state snapshot immediately
	counts, total, _ := h.redis.GetPollCounts(ctx, poll.ID.Hex())
	initialMsg := models.VoteStreamMessage{
		PollID:       poll.ID.Hex(),
		OptionCounts: counts,
		TotalVotes:   total,
		Timestamp:    time.Now().UnixMilli(),
	}
	if initBytes, err := json.Marshal(initialMsg); err == nil {
		_, _ = fmt.Fprintf(c.Writer, "event: initial\ndata: %s\n\n", string(initBytes))
		c.Writer.Flush()
	}

	// 2. Subscribe to Redis Pub/Sub channel
	pubsub := h.redis.SubscribePollChannel(ctx, poll.ID.Hex())
	defer pubsub.Close()

	ch := pubsub.Channel()
	clientGone := c.Writer.CloseNotify()

	for {
		select {
		case <-clientGone:
			return
		case <-ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			_, writeErr := fmt.Fprintf(c.Writer, "event: vote_update\ndata: %s\n\n", msg.Payload)
			if writeErr != nil {
				return
			}
			c.Writer.Flush()
		}
	}
}

func (h *PollHandler) UpdatePoll(c *gin.Context) {
	pollIDStr := c.Param("id")
	pollObjID, err := primitive.ObjectIDFromHex(pollIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid poll ID"})
		return
	}

	userIDStr, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication required"})
		return
	}
	userObjID, _ := primitive.ObjectIDFromHex(userIDStr.(string))

	var input models.UpdatePollInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid update input", "details": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var poll models.Poll
	err = h.pollCol.FindOne(ctx, bson.M{"_id": pollObjID}).Decode(&poll)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Poll not found"})
		return
	}

	if poll.CreatorID != userObjID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the poll creator can update its status"})
		return
	}

	updateFields := bson.M{"updated_at": time.Now()}
	if input.Status != nil {
		updateFields["status"] = *input.Status
	}

	_, err = h.pollCol.UpdateOne(ctx, bson.M{"_id": pollObjID}, bson.M{"$set": updateFields})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update poll"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Poll updated successfully"})
}
