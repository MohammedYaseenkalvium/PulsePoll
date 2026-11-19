package handlers

import (
	"context"
	"crypto/rand"
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
	"go.mongodb.org/mongo-driver/mongo/options"
)

type PollsHandler struct {
	pollCol *mongo.Collection
	voteCol *mongo.Collection
	redis   *realtime.RedisManager
}

func NewPollsHandler(db *mongo.Database, rdb *realtime.RedisManager) *PollsHandler {
	return &PollsHandler{
		pollCol: db.Collection("polls"),
		voteCol: db.Collection("votes"),
		redis:   rdb,
	}
}

const slugAlphabet = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ"

func generateShareSlug(length int) string {
	bytes := make([]byte, length)
	_, _ = rand.Read(bytes)
	for i := range bytes {
		bytes[i] = slugAlphabet[int(bytes[i])%len(slugAlphabet)]
	}
	return string(bytes)
}

// CreatePoll handles POST /api/polls (creator protected)
func (h *PollsHandler) CreatePoll(c *gin.Context) {
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

	question := strings.TrimSpace(input.Question)
	if question == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Poll question cannot be empty"})
		return
	}

	// Validate 2-10 options and ensure uniqueness
	if len(input.Options) < 2 || len(input.Options) > 10 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Poll must contain between 2 and 10 options"})
		return
	}

	optSeen := make(map[string]bool)
	var optionsList []models.PollOption
	var optionIDs []string

	for _, opt := range input.Options {
		trimmed := strings.TrimSpace(opt.Text)
		if trimmed == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Option text cannot be empty"})
			return
		}
		lower := strings.ToLower(trimmed)
		if optSeen[lower] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Poll options must be distinct"})
			return
		}
		optSeen[lower] = true

		optID := uuid.New().String()
		optionsList = append(optionsList, models.PollOption{
			ID:        optID,
			Text:      trimmed,
			VoteCount: 0,
		})
		optionIDs = append(optionIDs, optID)
	}

	now := time.Now()
	newPoll := models.Poll{
		ID:            primitive.NewObjectID(),
		Question:      question,
		Description:   strings.TrimSpace(input.Description),
		Options:       optionsList,
		Status:        models.PollStatusOpen,
		AllowMultiple: input.AllowMultiple,
		CreatorID:     creatorID,
		ShareSlug:     generateShareSlug(8),
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	_, err = h.pollCol.InsertOne(ctx, newPoll)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to persist poll in database"})
		return
	}

	// Initialize option counts (0) in Redis Hash (poll:{id}:counts)
	_ = h.redis.InitPollCounts(ctx, newPoll.ID.Hex(), optionIDs)

	c.JSON(http.StatusCreated, newPoll)
}

// GetMyPolls handles GET /api/polls (creator protected)
func (h *PollsHandler) GetMyPolls(c *gin.Context) {
	userIDStr, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication required"})
		return
	}

	creatorID, err := primitive.ObjectIDFromHex(userIDStr.(string))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 7*time.Second)
	defer cancel()

	findOpts := options.Find().SetSort(bson.M{"created_at": -1})
	cursor, err := h.pollCol.Find(ctx, bson.M{"creator_id": creatorID}, findOpts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to query creator polls"})
		return
	}
	defer cursor.Close(ctx)

	var polls []models.Poll
	if err := cursor.All(ctx, &polls); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode polls"})
		return
	}

	if polls == nil {
		polls = []models.Poll{}
	}

	// Hydrate live counts from Redis for each poll
	for i := range polls {
		counts, _, err := h.redis.GetPollCounts(ctx, polls[i].ID.Hex())
		if err == nil && len(counts) > 0 {
			for j := range polls[i].Options {
				if cnt, ok := counts[polls[i].Options[j].ID]; ok {
					polls[i].Options[j].VoteCount = cnt
				}
			}
		}
	}

	c.JSON(http.StatusOK, polls)
}

// UpdatePollStatus handles PATCH /api/polls/:id/status (creator protected)
func (h *PollsHandler) UpdatePollStatus(c *gin.Context) {
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

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

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

	// Verify ownership
	if poll.CreatorID != userObjID {
		c.JSON(http.StatusForbidden, gin.H{"error": "You do not have permission to modify this poll"})
		return
	}

	var targetStatus models.PollStatus
	var input models.UpdatePollStatusInput
	if err := c.ShouldBindJSON(&input); err == nil && input.Status != "" {
		targetStatus = input.Status
	} else {
		// Toggle status if not specified
		if poll.Status == models.PollStatusOpen {
			targetStatus = models.PollStatusClosed
		} else {
			targetStatus = models.PollStatusOpen
		}
	}

	// Update in MongoDB
	now := time.Now()
	_, err = h.pollCol.UpdateOne(
		ctx,
		bson.M{"_id": pollObjID},
		bson.M{"$set": bson.M{"status": targetStatus, "updated_at": now}},
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update poll status"})
		return
	}

	// Publish status-change event to Redis Pub/Sub (poll:{id}:updates)
	_ = h.redis.PublishStatusChange(ctx, poll.ID.Hex(), targetStatus)

	c.JSON(http.StatusOK, gin.H{
		"message": "Poll status updated successfully",
		"pollId":  poll.ID.Hex(),
		"status":  targetStatus,
	})
}

// DeletePoll handles DELETE /api/polls/:id (creator protected)
func (h *PollsHandler) DeletePoll(c *gin.Context) {
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

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

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

	// Verify ownership
	if poll.CreatorID != userObjID {
		c.JSON(http.StatusForbidden, gin.H{"error": "You do not have permission to delete this poll"})
		return
	}

	// Delete poll and associated votes from MongoDB
	_, err = h.pollCol.DeleteOne(ctx, bson.M{"_id": pollObjID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete poll from database"})
		return
	}
	_, _ = h.voteCol.DeleteMany(ctx, bson.M{"poll_id": pollObjID})

	// Clean up Redis keys
	_ = h.redis.DeletePollData(ctx, poll.ID.Hex())

	c.JSON(http.StatusOK, gin.H{
		"message": "Poll and related realtime metrics deleted successfully",
		"pollId":  poll.ID.Hex(),
	})
}
