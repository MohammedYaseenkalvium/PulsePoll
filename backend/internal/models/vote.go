package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type Vote struct {
	ID               primitive.ObjectID  `bson:"_id,omitempty" json:"id"`
	PollID           primitive.ObjectID  `bson:"poll_id" json:"pollId"`
	OptionIDs        []string            `bson:"option_ids" json:"optionIds"`
	UserID           *primitive.ObjectID `bson:"user_id,omitempty" json:"userId,omitempty"`
	VoterFingerprint string              `bson:"voter_fingerprint" json:"voterFingerprint"`
	IPAddress        string              `bson:"ip_address" json:"ipAddress"`
	CreatedAt        time.Time           `bson:"created_at" json:"createdAt"`
}

type CastVoteInput struct {
	OptionIDs        []string `json:"optionIds" binding:"required,min=1"`
	VoterFingerprint string   `json:"voterFingerprint" binding:"required,min=4"`
}

type VoteStreamMessage struct {
	PollID       string           `json:"pollId"`
	OptionCounts map[string]int64 `json:"optionCounts"`
	TotalVotes   int64            `json:"totalVotes"`
	Timestamp    int64            `json:"timestamp"`
}
