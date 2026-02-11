package main

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

var (
	activeWebSockets   = make(map[*websocket.Conn]bool)
	activeWebSocketsMu sync.Mutex
)

func main() {
	// Reset all stores
	resetStorage()
	resetTokenStore()
	resetInstances()
	resetMedia()
	resetStreamSessions()

	// Build registry
	registry := buildRegistry()
	registryJSON, _ := json.Marshal(registry)
	registryEtag := fmt.Sprintf("\"%x\"", sha256.Sum256(registryJSON))

	// Set up broadcast function
	setBroadcastFn(func(event string, data map[string]interface{}) {
		message, err := json.Marshal(data)
		if err != nil {
			return
		}
		activeWebSocketsMu.Lock()
		for ws := range activeWebSockets {
			err := ws.WriteMessage(websocket.TextMessage, message)
			if err != nil {
				// Connection may be closed
				ws.Close()
				delete(activeWebSockets, ws)
			}
		}
		activeWebSocketsMu.Unlock()
	})

	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())

	// GET /.well-known/ops -- registry
	r.GET("/.well-known/ops", func(c *gin.Context) {
		ifNoneMatch := c.GetHeader("If-None-Match")
		if ifNoneMatch == registryEtag {
			c.Status(304)
			return
		}
		c.Header("Cache-Control", "public, max-age=3600")
		c.Header("ETag", registryEtag)
		c.Data(200, "application/json; charset=utf-8", registryJSON)
	})

	// GET /call -- method not allowed, point to POST /call and registry
	r.GET("/call", func(c *gin.Context) {
		c.Header("Allow", "POST")
		c.JSON(405, gin.H{
			"requestId": newUUID(),
			"state":     "error",
			"error": gin.H{
				"code":    "METHOD_NOT_ALLOWED",
				"message": "Use POST /call to invoke operations. Discover available operations at GET /.well-known/ops",
			},
		})
	})

	// POST /call -- operation invocation
	r.POST("/call", func(c *gin.Context) {
		contentType := c.GetHeader("Content-Type")

		var envelope map[string]interface{}
		var mf *mediaFile

		if strings.Contains(contentType, "multipart/form-data") {
			// Parse multipart
			envelopePart := c.PostForm("envelope")
			if envelopePart == "" {
				// Try reading from file part named "envelope"
				file, _, err := c.Request.FormFile("envelope")
				if err != nil {
					c.JSON(400, gin.H{
						"requestId": newUUID(),
						"state":     "error",
						"error": gin.H{
							"code":    "INVALID_REQUEST",
							"message": "Missing envelope part in multipart request",
						},
					})
					return
				}
				data, _ := io.ReadAll(file)
				file.Close()
				envelopePart = string(data)
			}

			if err := json.Unmarshal([]byte(envelopePart), &envelope); err != nil {
				c.JSON(400, gin.H{
					"requestId": newUUID(),
					"state":     "error",
					"error": gin.H{
						"code":    "INVALID_REQUEST",
						"message": "Invalid JSON in envelope",
					},
				})
				return
			}

			// Read optional file upload
			file, header, err := c.Request.FormFile("file")
			if err == nil {
				data, _ := io.ReadAll(file)
				file.Close()
				filename := header.Filename
				if filename == "" {
					filename = "upload"
				}
				ct := header.Header.Get("Content-Type")
				if ct == "" {
					ct = "application/octet-stream"
				}
				mf = &mediaFile{
					Data:        data,
					ContentType: ct,
					Filename:    filename,
				}
			}
		} else {
			// JSON body
			body, err := io.ReadAll(c.Request.Body)
			if err != nil {
				c.JSON(400, gin.H{
					"requestId": newUUID(),
					"state":     "error",
					"error": gin.H{
						"code":    "INVALID_REQUEST",
						"message": "Invalid request body",
					},
				})
				return
			}
			if err := json.Unmarshal(body, &envelope); err != nil {
				c.JSON(400, gin.H{
					"requestId": newUUID(),
					"state":     "error",
					"error": gin.H{
						"code":    "INVALID_REQUEST",
						"message": "Invalid JSON in request body",
					},
				})
				return
			}
		}

		authHeader := c.GetHeader("Authorization")
		response := handleCall(envelope, authHeader, mf)

		status := response["status"].(int)
		body := response["body"].(map[string]interface{})
		c.JSON(status, body)
	})

	// GET /ops/:requestId -- poll async operation state
	r.GET("/ops/:requestId", func(c *gin.Context) {
		requestID := c.Param("requestId")
		instance := getInstance(requestID)
		if instance == nil {
			c.JSON(404, gin.H{
				"requestId": requestID,
				"state":     "error",
				"error": gin.H{
					"code":    "NOT_FOUND",
					"message": fmt.Sprintf("Operation %s not found", requestID),
				},
			})
			return
		}

		body := gin.H{
			"requestId": instance.RequestID,
			"state":     instance.State,
		}
		if instance.State == "complete" && instance.Result != nil {
			body["result"] = instance.Result
		}
		if instance.State == "error" && instance.Error != nil {
			body["error"] = instance.Error
		}
		if instance.State == "accepted" || instance.State == "pending" {
			body["retryAfterMs"] = instance.RetryAfterMs
		}
		body["expiresAt"] = instance.ExpiresAt
		c.JSON(200, body)
	})

	// GET /ops/:requestId/chunks -- chunked retrieval
	r.GET("/ops/:requestId/chunks", func(c *gin.Context) {
		requestID := c.Param("requestId")
		instance := getInstance(requestID)
		if instance == nil {
			c.JSON(404, gin.H{
				"requestId": requestID,
				"state":     "error",
				"error": gin.H{
					"code":    "NOT_FOUND",
					"message": fmt.Sprintf("Operation %s not found", requestID),
				},
			})
			return
		}

		if instance.State != "complete" || len(instance.Chunks) == 0 {
			c.JSON(400, gin.H{
				"requestId": requestID,
				"state":     "error",
				"error": gin.H{
					"code":    "NOT_READY",
					"message": "Operation not yet complete or has no chunks",
				},
			})
			return
		}

		cursorParam := c.Query("cursor")
		chunkIndex := 0
		if cursorParam != "" {
			decoded, err := base64.StdEncoding.DecodeString(cursorParam)
			if err == nil {
				offset, err := strconv.Atoi(string(decoded))
				if err == nil {
					found := false
					for i, ch := range instance.Chunks {
						if ch.Offset == offset {
							chunkIndex = i
							found = true
							break
						}
					}
					if !found {
						chunkIndex = 0
					}
				}
			}
		}

		ch := instance.Chunks[chunkIndex]
		c.JSON(200, gin.H{
			"requestId": requestID,
			"chunk": gin.H{
				"offset":           ch.Offset,
				"data":             ch.Data,
				"checksum":         ch.Checksum,
				"checksumPrevious": ch.ChecksumPrevious,
				"state":            ch.State,
				"cursor":           ch.Cursor,
			},
		})
	})

	// GET /media/:id -- 303 redirect to /media/:id/data
	r.GET("/media/:id", func(c *gin.Context) {
		// Check if this is actually a /media/:id/data request
		// Gin won't match /media/:id/data because :id is greedy,
		// so we handle it separately below
		mediaID := c.Param("id")
		media := getMedia(mediaID)
		if media == nil {
			c.JSON(404, gin.H{
				"requestId": newUUID(),
				"state":     "error",
				"error": gin.H{
					"code":    "NOT_FOUND",
					"message": "Media not found",
				},
			})
			return
		}
		c.Redirect(303, "/media/"+mediaID+"/data")
	})

	// GET /media/:id/data -- binary response
	r.GET("/media/:id/data", func(c *gin.Context) {
		mediaID := c.Param("id")
		media := getMedia(mediaID)
		if media == nil {
			c.JSON(404, gin.H{
				"requestId": newUUID(),
				"state":     "error",
				"error": gin.H{
					"code":    "NOT_FOUND",
					"message": "Media not found",
				},
			})
			return
		}
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", media.Filename))
		c.Data(200, media.ContentType, media.Data)
	})

	// WebSocket /streams/:sessionId
	r.GET("/streams/:sessionId", func(c *gin.Context) {
		sessionID := c.Param("sessionId")
		session := getStreamSession(sessionID)
		if session == nil {
			c.JSON(404, gin.H{
				"requestId": newUUID(),
				"state":     "error",
				"error": gin.H{
					"code":    "NOT_FOUND",
					"message": "Stream session not found",
				},
			})
			return
		}

		ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			c.JSON(400, gin.H{
				"requestId": newUUID(),
				"state":     "error",
				"error": gin.H{
					"code":    "UPGRADE_FAILED",
					"message": "WebSocket upgrade failed",
				},
			})
			return
		}

		activeWebSocketsMu.Lock()
		activeWebSockets[ws] = true
		activeWebSocketsMu.Unlock()

		// Read loop (just to detect disconnection)
		go func() {
			defer func() {
				activeWebSocketsMu.Lock()
				delete(activeWebSockets, ws)
				activeWebSocketsMu.Unlock()
				ws.Close()
			}()
			for {
				_, _, err := ws.ReadMessage()
				if err != nil {
					break
				}
			}
		}()
	})

	// POST /_internal/tokens -- register test tokens
	r.POST("/_internal/tokens", func(c *gin.Context) {
		var body struct {
			Token  string   `json:"token"`
			Scopes []string `json:"scopes"`
		}
		if err := c.BindJSON(&body); err != nil {
			c.JSON(400, gin.H{"error": "Invalid request"})
			return
		}
		registerToken(body.Token, body.Scopes)
		c.JSON(200, gin.H{"ok": true})
	})

	// Determine port
	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	log.Printf("OpenCALL Todo API (Go) listening on http://localhost:%s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
