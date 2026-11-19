package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"pulsepoll-backend/internal/models"
	"pulsepoll-backend/internal/realtime"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

type VoteHandler struct {
	pollCol *mongo.Collection
	voteCol *mongo.Collection
	redis   *realtime.RedisManager
}

func NewVoteHandler(db *mongo.Database, rdb *realtime.RedisManager) *VoteHandler {
	return &VoteHandler{
		pollCol: db.Collection("polls"),
		voteCol: db.Collection("votes"),
		redis:   rdb,
	}
}

// GetPollByShareSlug handles GET /api/polls/s/:shareSlug (public endpoint)
func (h *VoteHandler) GetPollByShareSlug(c *gin.Context) {
	shareSlug := strings.TrimSpace(c.Param("shareSlug"))
	if shareSlug == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Share slug parameter required"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var poll models.Poll
	err := h.pollCol.FindOne(ctx, bson.M{"share_slug": shareSlug}).Decode(&poll)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			c.JSON(http.StatusNotFound, gin.H{"error": "Poll not found for share slug"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error retrieving poll"})
		return
	}

	// Fetch live counts from Redis (hydrate cache on miss)
	_ = h.redis.HydratePollCounts(ctx, poll.ID.Hex(), poll.Options)
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

// GetPollByID handles GET /api/polls/:id (public endpoint)
func (h *VoteHandler) GetPollByID(c *gin.Context) {
	idStr := strings.TrimSpace(c.Param("id"))
	pollObjID, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid poll ID"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var poll models.Poll
	err = h.pollCol.FindOne(ctx, bson.M{"_id": pollObjID}).Decode(&poll)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			c.JSON(http.StatusNotFound, gin.H{"error": "Poll not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error retrieving poll"})
		return
	}

	// Fetch live counts from Redis (hydrate cache on miss)
	_ = h.redis.HydratePollCounts(ctx, poll.ID.Hex(), poll.Options)
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

// CastVote handles POST /api/polls/:id/vote
func (h *VoteHandler) CastVote(c *gin.Context) {
	pollIDStr := strings.TrimSpace(c.Param("id"))
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

	fingerprint := strings.TrimSpace(input.VoterFingerprint)
	if len(fingerprint) < 4 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Voter fingerprint must be at least 4 characters"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 7*time.Second)
	defer cancel()

	// 1. Verify poll exists in MongoDB and is currently open
	var poll models.Poll
	err = h.pollCol.FindOne(ctx, bson.M{"_id": pollObjID}).Decode(&poll)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			c.JSON(http.StatusNotFound, gin.H{"error": "Poll not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error retrieving poll"})
		return
	}

	if poll.Status != models.PollStatusOpen {
		c.JSON(http.StatusForbidden, gin.H{"error": "This poll is closed and no longer accepting votes"})
		return
	}

	// 2. Enforce single-choice constraints if allowMultiple is false
	if !poll.AllowMultiple && len(input.OptionIDs) > 1 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "This poll allows voting for only one option"})
		return
	}

	// 3. Verify all selected option IDs belong to this poll
	validOptions := make(map[string]bool)
	for _, opt := range poll.Options {
		validOptions[opt.ID] = true
	}
	for _, optID := range input.OptionIDs {
		if !validOptions[optID] {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Invalid option ID: %s", optID)})
			return
		}
	}

	// 4. Duplicate-vote prevention using Redis Set/Key + MongoDB verification
	var userObjID *primitive.ObjectID
	voterKey := fingerprint
	if uidVal, exists := c.Get("userID"); exists {
		if uid, err := primitive.ObjectIDFromHex(uidVal.(string)); err == nil {
			userObjID = &uid
			voterKey = fmt.Sprintf("u:%s", uid.Hex())
		}
	}

	// Check Redis duplicate prevention
	isNewVoter, err := h.redis.CheckAndSetVoter(ctx, poll.ID.Hex(), voterKey)
	if err != nil {
		// Log error but fallback to MongoDB check
		isNewVoter = true
	}
	if !isNewVoter {
		c.JSON(http.StatusConflict, gin.H{"error": "Duplicate vote detected. You have already cast a vote on this poll."})
		return
	}

	// Also check MongoDB persistence for duplicate votes
	dupConditions := []bson.M{
		{"voter_fingerprint": fingerprint},
	}
	if userObjID != nil {
		dupConditions = append(dupConditions, bson.M{"user_id": userObjID})
	}
	mongoDupCount, err := h.voteCol.CountDocuments(ctx, bson.M{
		"poll_id": pollObjID,
		"$or":     dupConditions,
	})
	if err == nil && mongoDupCount > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "Duplicate vote detected. You have already cast a vote on this poll."})
		return
	}

	// Ensure Redis counts are initialized before increment
	_ = h.redis.HydratePollCounts(ctx, poll.ID.Hex(), poll.Options)

	// 5. Atomically increment vote counts in Redis (HINCRBY) & publish to Redis Pub/Sub
	streamMsg, err := h.redis.IncrementVotes(ctx, poll.ID.Hex(), input.OptionIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to increment real-time vote metrics", "details": err.Error()})
		return
	}

	// 6. Record vote persistence in MongoDB
	clientIP := c.ClientIP()
	newVote := models.Vote{
		ID:               primitive.NewObjectID(),
		PollID:           pollObjID,
		OptionIDs:        input.OptionIDs,
		UserID:           userObjID,
		VoterFingerprint: fingerprint,
		IPAddress:        clientIP,
		CreatedAt:        time.Now(),
	}

	// Persist vote document safely
	go func(v models.Vote, pID primitive.ObjectID, counts map[string]int64) {
		bgCtx, bgCancel := context.WithTimeout(context.Background(), 8*time.Second)
		defer bgCancel()

		_, _ = h.voteCol.InsertOne(bgCtx, v)

		// Sync counts to MongoDB Poll document
		for optID, count := range counts {
			_, _ = h.pollCol.UpdateOne(
				bgCtx,
				bson.M{"_id": pID, "options.id": optID},
				bson.M{"$set": bson.M{"options.$.vote_count": count, "updated_at": time.Now()}},
			)
		}
	}(newVote, pollObjID, streamMsg.OptionCounts)

	// 7. Return 200 OK only after Redis confirms the write
	c.JSON(http.StatusOK, gin.H{
		"message":      "Vote successfully cast",
		"pollId":       poll.ID.Hex(),
		"optionCounts": streamMsg.OptionCounts,
		"totalVotes":   streamMsg.TotalVotes,
		"timestamp":    streamMsg.Timestamp,
	})
}
