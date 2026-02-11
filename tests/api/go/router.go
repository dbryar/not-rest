package main

import (
	"fmt"
	"time"
)

func handleCall(envelope map[string]interface{}, authHeader string, mf *mediaFile) (result map[string]interface{}) {
	// Extract requestId and sessionId from ctx
	requestID := newUUID()
	var sessionID string
	hasSessionID := false

	if ctx, ok := envelope["ctx"].(map[string]interface{}); ok {
		if rid, ok := ctx["requestId"].(string); ok && rid != "" {
			requestID = rid
		}
		if sid, ok := ctx["sessionId"].(string); ok && sid != "" {
			sessionID = sid
			hasSessionID = true
		}
	}

	base := map[string]interface{}{
		"requestId": requestID,
	}
	if hasSessionID {
		base["sessionId"] = sessionID
	}

	// Recover from panics (ValidationError, ServerError)
	defer func() {
		if r := recover(); r != nil {
			switch err := r.(type) {
			case *ValidationError:
				result = map[string]interface{}{
					"status": 400,
					"body": mergeMap(copyMap(base), map[string]interface{}{
						"state": "error",
						"error": map[string]interface{}{
							"code":    "VALIDATION_ERROR",
							"message": err.Msg,
						},
					}),
				}
			case *ServerError:
				result = map[string]interface{}{
					"status": err.StatusCode,
					"body": mergeMap(copyMap(base), map[string]interface{}{
						"state": "error",
						"error": map[string]interface{}{
							"code":    err.Code,
							"message": err.Msg,
						},
					}),
				}
			default:
				msg := "Unknown error"
				if e, ok := r.(error); ok {
					msg = e.Error()
				} else if s, ok := r.(string); ok {
					msg = s
				}
				result = map[string]interface{}{
					"status": 500,
					"body": mergeMap(copyMap(base), map[string]interface{}{
						"state": "error",
						"error": map[string]interface{}{
							"code":    "INTERNAL_ERROR",
							"message": msg,
						},
					}),
				}
			}
		}
	}()

	// Validate op is present and a string
	opVal, opExists := envelope["op"]
	if !opExists || opVal == nil {
		return map[string]interface{}{
			"status": 400,
			"body": mergeMap(copyMap(base), map[string]interface{}{
				"state": "error",
				"error": map[string]interface{}{
					"code":    "INVALID_REQUEST",
					"message": "Missing or invalid 'op' field",
				},
			}),
		}
	}
	op, ok := opVal.(string)
	if !ok || op == "" {
		return map[string]interface{}{
			"status": 400,
			"body": mergeMap(copyMap(base), map[string]interface{}{
				"state": "error",
				"error": map[string]interface{}{
					"code":    "INVALID_REQUEST",
					"message": "Missing or invalid 'op' field",
				},
			}),
		}
	}

	// Look up operation
	operation, exists := operations[op]
	if !exists {
		return map[string]interface{}{
			"status": 400,
			"body": mergeMap(copyMap(base), map[string]interface{}{
				"state": "error",
				"error": map[string]interface{}{
					"code":    "UNKNOWN_OP",
					"message": fmt.Sprintf("Unknown operation: %s", op),
				},
			}),
		}
	}

	// Deprecated check -- past sunset date means 410
	if operation.deprecated && operation.sunset != "" {
		sunsetDate, err := time.Parse("2006-01-02", operation.sunset)
		if err == nil && time.Now().After(sunsetDate) {
			var replacement interface{} = nil
			if operation.replacement != "" {
				replacement = operation.replacement
			}
			return map[string]interface{}{
				"status": 410,
				"body": mergeMap(copyMap(base), map[string]interface{}{
					"state": "error",
					"error": map[string]interface{}{
						"code":    "OP_REMOVED",
						"message": fmt.Sprintf("Operation %s has been removed", op),
						"cause": map[string]interface{}{
							"removedOp":   op,
							"replacement": replacement,
						},
					},
				}),
			}
		}
	}

	// Auth check
	if len(operation.authScopes) > 0 {
		authRes := validateAuth(authHeader, operation.authScopes)
		if !authRes.Valid {
			return map[string]interface{}{
				"status": authRes.Status,
				"body": mergeMap(copyMap(base), map[string]interface{}{
					"state": "error",
					"error": map[string]interface{}{
						"code":    authRes.Code,
						"message": authRes.Message,
					},
				}),
			}
		}
	}

	// Idempotency check
	var idempotencyKey string
	if ctx, ok := envelope["ctx"].(map[string]interface{}); ok {
		if ik, ok := ctx["idempotencyKey"].(string); ok {
			idempotencyKey = ik
		}
	}

	if operation.sideEffecting && idempotencyKey != "" {
		idempotencyStoreMu.RLock()
		cached, exists := idempotencyStore[idempotencyKey]
		idempotencyStoreMu.RUnlock()
		if exists {
			return cached.(map[string]interface{})
		}
	}

	// Extract args
	args, _ := envelope["args"].(map[string]interface{})

	// Execute handler
	// Stream operations
	if operation.executionModel == "stream" && operation.streamHandler != nil {
		streamResult := operation.streamHandler(args)
		if streamResult["ok"] == false {
			return map[string]interface{}{
				"status": 200,
				"body": mergeMap(copyMap(base), map[string]interface{}{
					"state": "error",
					"error": streamResult["error"],
				}),
			}
		}
		return map[string]interface{}{
			"status": 202,
			"body": mergeMap(copyMap(base), map[string]interface{}{
				"state": "streaming",
				"stream": map[string]interface{}{
					"transport": "wss",
					"location":  fmt.Sprintf("/streams/%s", streamResult["sessionId"]),
					"sessionId": streamResult["sessionId"],
					"encoding":  "json",
				},
			}),
		}
	}

	// Async operations
	if operation.executionModel == "async" && operation.asyncHandler != nil {
		asyncResult := operation.asyncHandler(args, requestID)
		if asyncResult["ok"] == false {
			return map[string]interface{}{
				"status": 200,
				"body": mergeMap(copyMap(base), map[string]interface{}{
					"state": "error",
					"error": asyncResult["error"],
				}),
			}
		}
		return map[string]interface{}{
			"status": 202,
			"body": mergeMap(copyMap(base), map[string]interface{}{
				"state":        "accepted",
				"retryAfterMs": 100,
			}),
		}
	}

	// Sync operations (including media)
	var handlerResult map[string]interface{}
	if operation.acceptsMedia && operation.mediaHandler != nil {
		handlerResult = operation.mediaHandler(args, mf)
	} else if operation.handler != nil {
		handlerResult = operation.handler(args)
	} else {
		return map[string]interface{}{
			"status": 500,
			"body": mergeMap(copyMap(base), map[string]interface{}{
				"state": "error",
				"error": map[string]interface{}{
					"code":    "INTERNAL_ERROR",
					"message": "No handler for operation",
				},
			}),
		}
	}

	var response map[string]interface{}
	if handlerResult["ok"] == true {
		response = map[string]interface{}{
			"status": 200,
			"body": mergeMap(copyMap(base), map[string]interface{}{
				"state":  "complete",
				"result": handlerResult["result"],
			}),
		}
	} else {
		// Domain error -- HTTP 200
		response = map[string]interface{}{
			"status": 200,
			"body": mergeMap(copyMap(base), map[string]interface{}{
				"state": "error",
				"error": handlerResult["error"],
			}),
		}
	}

	// Store for idempotency
	if operation.sideEffecting && idempotencyKey != "" {
		idempotencyStoreMu.Lock()
		idempotencyStore[idempotencyKey] = response
		idempotencyStoreMu.Unlock()
	}

	return response
}

func mergeMap(base, overlay map[string]interface{}) map[string]interface{} {
	for k, v := range overlay {
		base[k] = v
	}
	return base
}
