package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type PollStatus string

const (
	PollStatusOpen   PollStatus = "open"
	PollStatusClosed PollStatus = "closed"
)

type PollOption struct {
	ID        string `bson:"id" json:"id"`
	Text      string `bson:"text" json:"text"`
	VoteCount int64  `bson:"vote_count" json:"voteCount"`
}

type Poll struct {
	ID            primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Question      string             `bson:"question" json:"question"`
	Description   string             `bson:"description" json:"description"`
	Options       []PollOption       `bson:"options" json:"options"`
	Status        PollStatus         `bson:"status" json:"status"`
	AllowMultiple bool               `bson:"allow_multiple" json:"allowMultiple"`
	CreatorID     primitive.ObjectID `bson:"creator_id" json:"creatorId"`
	ShareSlug     string             `bson:"share_slug" json:"shareSlug"`
	CreatedAt     time.Time          `bson:"created_at" json:"createdAt"`
	UpdatedAt     time.Time          `bson:"updated_at" json:"updatedAt"`
}

type CreateOptionInput struct {
	Text string `json:"text" binding:"required,min=1,max=200"`
}

type CreatePollInput struct {
	Question      string              `json:"question" binding:"required,min=3,max=300"`
	Description   string              `json:"description" binding:"max=2000"`
	Options       []CreateOptionInput `json:"options" binding:"required,min=2,max=10,dive"`
	AllowMultiple bool                `json:"allowMultiple"`
}

type UpdatePollStatusInput struct {
	Status PollStatus `json:"status" binding:"required,oneof=open closed"`
}
