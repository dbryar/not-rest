package main

import (
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"sync"
	"time"
)

type chunk struct {
	Offset           int     `json:"offset"`
	Data             string  `json:"data"`
	Checksum         string  `json:"checksum"`
	ChecksumPrevious *string `json:"checksumPrevious"`
	State            string  `json:"state"`
	Cursor           *string `json:"cursor"`
}

type operationInstance struct {
	RequestID    string
	Op           string
	State        string // "accepted", "pending", "complete", "error"
	Result       interface{}
	Error        map[string]interface{}
	RetryAfterMs int
	CreatedAt    int64
	ExpiresAt    int64
	Chunks       []chunk
}

var (
	instances   = make(map[string]*operationInstance)
	instancesMu sync.RWMutex
)

func createInstance(requestID string, op string) *operationInstance {
	instance := &operationInstance{
		RequestID:    requestID,
		Op:           op,
		State:        "accepted",
		RetryAfterMs: 100,
		CreatedAt:    time.Now().Unix(),
		ExpiresAt:    time.Now().Add(3600 * time.Second).Unix(),
	}

	instancesMu.Lock()
	instances[requestID] = instance
	instancesMu.Unlock()
	return instance
}

func transitionTo(requestID string, state string, data map[string]interface{}) *operationInstance {
	instancesMu.Lock()
	defer instancesMu.Unlock()

	instance, exists := instances[requestID]
	if !exists {
		return nil
	}
	instance.State = state
	if data != nil {
		if result, ok := data["result"]; ok {
			instance.Result = result
		}
		if errVal, ok := data["error"]; ok {
			if errMap, ok := errVal.(map[string]interface{}); ok {
				instance.Error = errMap
			}
		}
		if chunksVal, ok := data["chunks"]; ok {
			if chunks, ok := chunksVal.([]chunk); ok {
				instance.Chunks = chunks
			}
		}
	}
	return instance
}

func getInstance(requestID string) *operationInstance {
	instancesMu.RLock()
	defer instancesMu.RUnlock()
	return instances[requestID]
}

func resetInstances() {
	instancesMu.Lock()
	defer instancesMu.Unlock()
	instances = make(map[string]*operationInstance)
}

func computeSha256(data string) string {
	h := sha256.Sum256([]byte(data))
	return fmt.Sprintf("sha256:%x", h)
}

func buildChunks(data string, chunkSize int) []chunk {
	if chunkSize <= 0 {
		chunkSize = 512
	}
	var chunks []chunk
	offset := 0
	var previousChecksum *string

	for offset < len(data) {
		end := offset + chunkSize
		if end > len(data) {
			end = len(data)
		}
		chunkData := data[offset:end]
		checksum := computeSha256(chunkData)
		isLast := end >= len(data)

		var cursor *string
		if !isLast {
			c := base64.StdEncoding.EncodeToString([]byte(fmt.Sprintf("%d", end)))
			cursor = &c
		}

		state := "partial"
		if isLast {
			state = "complete"
		}

		chunks = append(chunks, chunk{
			Offset:           offset,
			Data:             chunkData,
			Checksum:         checksum,
			ChecksumPrevious: previousChecksum,
			State:            state,
			Cursor:           cursor,
		})

		prev := checksum
		previousChecksum = &prev
		offset = end
	}

	return chunks
}

func nowISO() string {
	return time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
}
