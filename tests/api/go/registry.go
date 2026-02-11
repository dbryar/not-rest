package main

func buildRegistry() map[string]interface{} {
	todoSchema := map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"id":          map[string]interface{}{"type": "string"},
			"title":       map[string]interface{}{"type": "string"},
			"description": map[string]interface{}{"type": "string"},
			"dueDate":     map[string]interface{}{"type": "string"},
			"labels":      map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "string"}},
			"completed":   map[string]interface{}{"type": "boolean"},
			"completedAt": map[string]interface{}{"type": []interface{}{"string", "null"}},
			"createdAt":   map[string]interface{}{"type": "string"},
			"updatedAt":   map[string]interface{}{"type": "string"},
			"attachmentId": map[string]interface{}{"type": "string"},
			"location": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"uri":    map[string]interface{}{"type": "string"},
					"method": map[string]interface{}{"type": "string"},
					"headers": map[string]interface{}{
						"type":                 "object",
						"additionalProperties": map[string]interface{}{"type": "string"},
					},
				},
				"required":             []interface{}{"uri"},
				"additionalProperties": false,
			},
		},
		"required":             []interface{}{"id", "title", "completed", "createdAt", "updatedAt"},
		"additionalProperties": false,
	}

	listTodosResultSchema := map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"items": map[string]interface{}{
				"type":  "array",
				"items": todoSchema,
			},
			"cursor": map[string]interface{}{"type": []interface{}{"string", "null"}},
			"total":  map[string]interface{}{"type": "integer"},
		},
		"required":             []interface{}{"items", "cursor", "total"},
		"additionalProperties": false,
	}

	watchTodosFrameSchema := map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"event": map[string]interface{}{
				"type": "string",
				"enum": []interface{}{"created", "updated", "deleted", "completed"},
			},
			"todo":      todoSchema,
			"todoId":    map[string]interface{}{"type": "string"},
			"timestamp": map[string]interface{}{"type": "string"},
		},
		"required":             []interface{}{"event", "timestamp"},
		"additionalProperties": false,
	}

	return map[string]interface{}{
		"callVersion": "2026-02-10",
		"operations": []interface{}{
			map[string]interface{}{
				"op":          "v1:todos.create",
				"description": "Create a new todo item",
				"argsSchema": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"title":       map[string]interface{}{"type": "string"},
						"description": map[string]interface{}{"type": "string"},
						"dueDate":     map[string]interface{}{"type": "string"},
						"labels":      map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "string"}},
					},
					"required":             []interface{}{"title"},
					"additionalProperties": false,
				},
				"resultSchema":       todoSchema,
				"sideEffecting":      true,
				"idempotencyRequired": true,
				"executionModel":     "sync",
				"authScopes":         []interface{}{"todos:write"},
			},
			map[string]interface{}{
				"op":          "v1:todos.get",
				"description": "Get a todo item by ID",
				"argsSchema": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"id": map[string]interface{}{"type": "string"},
					},
					"required":             []interface{}{"id"},
					"additionalProperties": false,
				},
				"resultSchema":       todoSchema,
				"sideEffecting":      false,
				"idempotencyRequired": false,
				"executionModel":     "sync",
				"authScopes":         []interface{}{"todos:read"},
			},
			map[string]interface{}{
				"op":          "v1:todos.list",
				"description": "List todo items with optional filters and pagination",
				"argsSchema": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"cursor": map[string]interface{}{"type": "string"},
						"limit": map[string]interface{}{
							"type":    "integer",
							"minimum": 1,
							"maximum": 100,
							"default": 20,
						},
						"completed": map[string]interface{}{"type": "boolean"},
						"label":     map[string]interface{}{"type": "string"},
					},
					"additionalProperties": false,
				},
				"resultSchema":       listTodosResultSchema,
				"sideEffecting":      false,
				"idempotencyRequired": false,
				"executionModel":     "sync",
				"authScopes":         []interface{}{"todos:read"},
			},
			map[string]interface{}{
				"op":          "v1:todos.update",
				"description": "Update a todo item",
				"argsSchema": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"id":          map[string]interface{}{"type": "string"},
						"title":       map[string]interface{}{"type": "string"},
						"description": map[string]interface{}{"type": "string"},
						"dueDate":     map[string]interface{}{"type": "string"},
						"labels":      map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "string"}},
						"completed":   map[string]interface{}{"type": "boolean"},
					},
					"required":             []interface{}{"id"},
					"additionalProperties": false,
				},
				"resultSchema":       todoSchema,
				"sideEffecting":      true,
				"idempotencyRequired": true,
				"executionModel":     "sync",
				"authScopes":         []interface{}{"todos:write"},
			},
			map[string]interface{}{
				"op":          "v1:todos.delete",
				"description": "Delete a todo item",
				"argsSchema": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"id": map[string]interface{}{"type": "string"},
					},
					"required":             []interface{}{"id"},
					"additionalProperties": false,
				},
				"resultSchema": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"deleted": map[string]interface{}{"type": "boolean"},
					},
					"required":             []interface{}{"deleted"},
					"additionalProperties": false,
				},
				"sideEffecting":      true,
				"idempotencyRequired": true,
				"executionModel":     "sync",
				"authScopes":         []interface{}{"todos:write"},
			},
			map[string]interface{}{
				"op":          "v1:todos.complete",
				"description": "Mark a todo item as complete",
				"argsSchema": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"id": map[string]interface{}{"type": "string"},
					},
					"required":             []interface{}{"id"},
					"additionalProperties": false,
				},
				"resultSchema":       todoSchema,
				"sideEffecting":      true,
				"idempotencyRequired": true,
				"executionModel":     "sync",
				"authScopes":         []interface{}{"todos:write"},
			},
			map[string]interface{}{
				"op":          "v1:todos.export",
				"description": "Export all todos in CSV or JSON format",
				"argsSchema": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"format": map[string]interface{}{
							"type":    "string",
							"enum":    []interface{}{"csv", "json"},
							"default": "csv",
						},
					},
					"additionalProperties": false,
				},
				"resultSchema": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"format": map[string]interface{}{"type": "string"},
						"data":   map[string]interface{}{"type": "string"},
						"count":  map[string]interface{}{"type": "integer"},
					},
					"required":             []interface{}{"format", "data", "count"},
					"additionalProperties": false,
				},
				"sideEffecting":      false,
				"idempotencyRequired": false,
				"executionModel":     "async",
				"authScopes":         []interface{}{"todos:read"},
			},
			map[string]interface{}{
				"op":          "v1:reports.generate",
				"description": "Generate a summary report of todos",
				"argsSchema": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"type": map[string]interface{}{
							"type":    "string",
							"enum":    []interface{}{"summary", "detailed"},
							"default": "summary",
						},
					},
					"additionalProperties": false,
				},
				"resultSchema": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"type":           map[string]interface{}{"type": "string"},
						"totalTodos":     map[string]interface{}{"type": "integer"},
						"completedTodos": map[string]interface{}{"type": "integer"},
						"pendingTodos":   map[string]interface{}{"type": "integer"},
						"generatedAt":    map[string]interface{}{"type": "string"},
					},
					"required":             []interface{}{"type", "totalTodos", "completedTodos", "pendingTodos", "generatedAt"},
					"additionalProperties": false,
				},
				"sideEffecting":      false,
				"idempotencyRequired": false,
				"executionModel":     "async",
				"authScopes":         []interface{}{"reports:read"},
			},
			map[string]interface{}{
				"op":          "v1:todos.search",
				"description": "Search todos by query (deprecated, use v1:todos.list with label filter)",
				"argsSchema": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"query": map[string]interface{}{"type": "string"},
						"limit": map[string]interface{}{
							"type":    "integer",
							"minimum": 1,
							"maximum": 100,
							"default": 20,
						},
					},
					"required":             []interface{}{"query"},
					"additionalProperties": false,
				},
				"resultSchema":       listTodosResultSchema,
				"sideEffecting":      false,
				"idempotencyRequired": false,
				"executionModel":     "sync",
				"authScopes":         []interface{}{"todos:read"},
				"deprecated":         true,
				"sunset":             "2025-01-01",
				"replacement":        "v1:todos.list",
			},
			map[string]interface{}{
				"op":          "v1:debug.simulateError",
				"description": "Simulate a server error for testing (test-only)",
				"argsSchema": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"statusCode": map[string]interface{}{"type": "integer"},
						"code":       map[string]interface{}{"type": "string", "default": "SIMULATED_ERROR"},
						"message":    map[string]interface{}{"type": "string", "default": "Simulated error for testing"},
					},
					"required":             []interface{}{"statusCode"},
					"additionalProperties": false,
				},
				"resultSchema": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"simulated": map[string]interface{}{"type": "boolean"},
					},
					"required":             []interface{}{"simulated"},
					"additionalProperties": false,
				},
				"sideEffecting":      false,
				"idempotencyRequired": false,
				"executionModel":     "sync",
				"authScopes":         []interface{}{},
			},
			map[string]interface{}{
				"op":          "v1:todos.watch",
				"description": "Watch for changes to todo items via WebSocket stream",
				"argsSchema": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"filter": map[string]interface{}{
							"type":    "string",
							"enum":    []interface{}{"all", "completed", "pending"},
							"default": "all",
						},
					},
					"additionalProperties": false,
				},
				"resultSchema":        watchTodosFrameSchema,
				"sideEffecting":       false,
				"idempotencyRequired": false,
				"executionModel":      "stream",
				"authScopes":          []interface{}{"todos:read"},
				"supportedTransports": []interface{}{"wss"},
				"supportedEncodings":  []interface{}{"json"},
				"frameSchema":         watchTodosFrameSchema,
				"ttlSeconds":          3600,
			},
			map[string]interface{}{
				"op":          "v1:todos.attach",
				"description": "Attach a file to a todo item",
				"argsSchema": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"todoId": map[string]interface{}{"type": "string"},
						"ref":    map[string]interface{}{"type": "string"},
					},
					"required":             []interface{}{"todoId"},
					"additionalProperties": false,
				},
				"resultSchema": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"todoId":       map[string]interface{}{"type": "string"},
						"attachmentId": map[string]interface{}{"type": "string"},
						"contentType":  map[string]interface{}{"type": "string"},
						"filename":     map[string]interface{}{"type": "string"},
					},
					"required":             []interface{}{"todoId", "attachmentId", "contentType", "filename"},
					"additionalProperties": false,
				},
				"sideEffecting":      true,
				"idempotencyRequired": true,
				"executionModel":     "sync",
				"authScopes":         []interface{}{"todos:write"},
				"mediaSchema": map[string]interface{}{
					"name":          "file",
					"required":      false,
					"acceptedTypes": []interface{}{"image/png", "image/jpeg", "application/pdf", "text/plain"},
					"maxBytes":      10485760,
				},
			},
		},
	}
}
