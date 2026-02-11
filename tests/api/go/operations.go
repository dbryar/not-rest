package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

// ValidationError is thrown on arg validation failure (-> 400)
type ValidationError struct {
	Msg string
}

func (e *ValidationError) Error() string { return e.Msg }

// ServerError is thrown by debug.simulateError (-> custom status)
type ServerError struct {
	StatusCode int
	Code       string
	Msg        string
}

func (e *ServerError) Error() string { return e.Msg }

// ---------------------------------------------------------------------------
// Stream session management
// ---------------------------------------------------------------------------

type streamSession struct {
	SessionID string
}

var (
	streamSessions   = make(map[string]*streamSession)
	streamSessionsMu sync.RWMutex
	broadcastFn      func(event string, data map[string]interface{})
	broadcastFnMu    sync.RWMutex
)

func registerStreamSession(sessionID string) *streamSession {
	s := &streamSession{SessionID: sessionID}
	streamSessionsMu.Lock()
	streamSessions[sessionID] = s
	streamSessionsMu.Unlock()
	return s
}

func getStreamSession(sessionID string) *streamSession {
	streamSessionsMu.RLock()
	defer streamSessionsMu.RUnlock()
	return streamSessions[sessionID]
}

func setBroadcastFn(fn func(event string, data map[string]interface{})) {
	broadcastFnMu.Lock()
	defer broadcastFnMu.Unlock()
	broadcastFn = fn
}

func broadcast(event string, data map[string]interface{}) {
	broadcastFnMu.RLock()
	fn := broadcastFn
	broadcastFnMu.RUnlock()
	if fn != nil {
		fn(event, data)
	}
}

func resetStreamSessions() {
	streamSessionsMu.Lock()
	streamSessions = make(map[string]*streamSession)
	streamSessionsMu.Unlock()
	broadcastFnMu.Lock()
	broadcastFn = nil
	broadcastFnMu.Unlock()
}

// ---------------------------------------------------------------------------
// In-memory storage
// ---------------------------------------------------------------------------

var (
	todos           = make(map[string]map[string]interface{})
	todosMu         sync.RWMutex
	todoOrder       []string // track insertion order
	idempotencyStore   = make(map[string]interface{})
	idempotencyStoreMu sync.RWMutex
)

func getIdempotencyStore() map[string]interface{} {
	return idempotencyStore
}

func resetStorage() {
	todosMu.Lock()
	todos = make(map[string]map[string]interface{})
	todoOrder = nil
	todosMu.Unlock()
	idempotencyStoreMu.Lock()
	idempotencyStore = make(map[string]interface{})
	idempotencyStoreMu.Unlock()
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

func validateString(args map[string]interface{}, field string, required bool) (string, bool) {
	val, exists := args[field]
	if !exists || val == nil {
		if required {
			panic(&ValidationError{Msg: field + ": Required"})
		}
		return "", false
	}
	s, ok := val.(string)
	if !ok {
		panic(&ValidationError{Msg: fmt.Sprintf("%s: Expected string, received %s", field, jsonTypeName(val))})
	}
	return s, true
}

func validateInt(args map[string]interface{}, field string, required bool, minimum, maximum, defaultVal *int) int {
	val, exists := args[field]
	if !exists || val == nil {
		if required {
			panic(&ValidationError{Msg: field + ": Required"})
		}
		if defaultVal != nil {
			return *defaultVal
		}
		return 0
	}
	// Reject booleans (Go JSON decodes booleans as bool, not float64)
	if _, isBool := val.(bool); isBool {
		panic(&ValidationError{Msg: fmt.Sprintf("%s: Expected number, received boolean", field)})
	}
	f, ok := val.(float64)
	if !ok {
		panic(&ValidationError{Msg: fmt.Sprintf("%s: Expected number, received %s", field, jsonTypeName(val))})
	}
	i := int(f)
	if minimum != nil && i < *minimum {
		panic(&ValidationError{Msg: fmt.Sprintf("%s: Number must be greater than or equal to %d", field, *minimum)})
	}
	if maximum != nil && i > *maximum {
		panic(&ValidationError{Msg: fmt.Sprintf("%s: Number must be less than or equal to %d", field, *maximum)})
	}
	return i
}

func validateBool(args map[string]interface{}, field string, required bool) (bool, bool) {
	val, exists := args[field]
	if !exists || val == nil {
		if required {
			panic(&ValidationError{Msg: field + ": Required"})
		}
		return false, false
	}
	b, ok := val.(bool)
	if !ok {
		panic(&ValidationError{Msg: fmt.Sprintf("%s: Expected boolean, received %s", field, jsonTypeName(val))})
	}
	return b, true
}

func validateStringArray(args map[string]interface{}, field string, required bool) ([]string, bool) {
	val, exists := args[field]
	if !exists || val == nil {
		if required {
			panic(&ValidationError{Msg: field + ": Required"})
		}
		return nil, false
	}
	arr, ok := val.([]interface{})
	if !ok {
		panic(&ValidationError{Msg: fmt.Sprintf("%s: Expected array, received %s", field, jsonTypeName(val))})
	}
	result := make([]string, len(arr))
	for i, item := range arr {
		s, ok := item.(string)
		if !ok {
			panic(&ValidationError{Msg: fmt.Sprintf("%s.%d: Expected string, received %s", field, i, jsonTypeName(item))})
		}
		result[i] = s
	}
	return result, true
}

func validateEnum(args map[string]interface{}, field string, options []string, required bool, defaultVal string) string {
	val, exists := args[field]
	if !exists || val == nil {
		if required {
			panic(&ValidationError{Msg: field + ": Required"})
		}
		return defaultVal
	}
	s, ok := val.(string)
	if !ok {
		panic(&ValidationError{Msg: fmt.Sprintf("%s: Expected string, received %s", field, jsonTypeName(val))})
	}
	for _, opt := range options {
		if s == opt {
			return s
		}
	}
	quoted := make([]string, len(options))
	for i, o := range options {
		quoted[i] = "'" + o + "'"
	}
	panic(&ValidationError{Msg: fmt.Sprintf("%s: Invalid enum value. Expected %s, received '%s'", field, strings.Join(quoted, " | "), s)})
}

func jsonTypeName(v interface{}) string {
	switch v.(type) {
	case string:
		return "string"
	case float64:
		return "number"
	case bool:
		return "boolean"
	case []interface{}:
		return "array"
	case map[string]interface{}:
		return "object"
	case nil:
		return "null"
	default:
		return fmt.Sprintf("%T", v)
	}
}

// ensureArgs returns args as map, defaulting to empty map if nil
func ensureArgs(args map[string]interface{}) map[string]interface{} {
	if args == nil {
		return make(map[string]interface{})
	}
	return args
}

// ---------------------------------------------------------------------------
// Operation handlers
// ---------------------------------------------------------------------------

func todosCreate(args map[string]interface{}) map[string]interface{} {
	args = ensureArgs(args)
	title, _ := validateString(args, "title", true)
	description, hasDesc := validateString(args, "description", false)
	dueDate, hasDue := validateString(args, "dueDate", false)
	labels, hasLabels := validateStringArray(args, "labels", false)

	now := nowISO()
	todo := map[string]interface{}{
		"id":          newUUID(),
		"title":       title,
		"completed":   false,
		"completedAt": nil,
		"createdAt":   now,
		"updatedAt":   now,
	}
	if hasDesc {
		todo["description"] = description
	}
	if hasDue {
		todo["dueDate"] = dueDate
	}
	if hasLabels {
		todo["labels"] = labels
	}

	id := todo["id"].(string)
	todosMu.Lock()
	todos[id] = todo
	todoOrder = append(todoOrder, id)
	todosMu.Unlock()

	broadcast("created", map[string]interface{}{"event": "created", "todo": copyMap(todo), "timestamp": now})
	return map[string]interface{}{"ok": true, "result": todo}
}

func todosGet(args map[string]interface{}) map[string]interface{} {
	args = ensureArgs(args)
	id, _ := validateString(args, "id", true)

	todosMu.RLock()
	todo, exists := todos[id]
	todosMu.RUnlock()

	if !exists {
		return map[string]interface{}{
			"ok":    false,
			"error": map[string]interface{}{"code": "TODO_NOT_FOUND", "message": fmt.Sprintf("Todo with id '%s' not found", id)},
		}
	}
	return map[string]interface{}{"ok": true, "result": todo}
}

func todosList(args map[string]interface{}) map[string]interface{} {
	args = ensureArgs(args)
	cursor, _ := validateString(args, "cursor", false)
	defaultLimit := intPtr(20)
	min := intPtr(1)
	max := intPtr(100)
	limit := validateInt(args, "limit", false, min, max, defaultLimit)
	completed, hasCompleted := validateBool(args, "completed", false)
	label, hasLabel := validateString(args, "label", false)

	todosMu.RLock()
	// Maintain insertion order
	var items []map[string]interface{}
	for _, id := range todoOrder {
		if t, ok := todos[id]; ok {
			items = append(items, t)
		}
	}
	todosMu.RUnlock()

	// Apply filters
	if hasCompleted {
		var filtered []map[string]interface{}
		for _, t := range items {
			if t["completed"] == completed {
				filtered = append(filtered, t)
			}
		}
		items = filtered
	}
	if hasLabel {
		var filtered []map[string]interface{}
		for _, t := range items {
			if labelsVal, ok := t["labels"]; ok {
				if labelsList, ok := labelsVal.([]string); ok {
					for _, l := range labelsList {
						if l == label {
							filtered = append(filtered, t)
							break
						}
					}
				}
			}
		}
		items = filtered
	}

	total := len(items)

	// Cursor pagination
	startIndex := 0
	if cursor != "" {
		decoded, err := base64.StdEncoding.DecodeString(cursor)
		if err == nil {
			parsed, err := strconv.Atoi(string(decoded))
			if err == nil {
				startIndex = parsed
			}
		}
	}

	end := startIndex + limit
	if end > len(items) {
		end = len(items)
	}
	var paged []map[string]interface{}
	if startIndex < len(items) {
		paged = items[startIndex:end]
	} else {
		paged = []map[string]interface{}{}
	}

	nextIndex := startIndex + limit
	var nextCursor interface{} // nil for JSON null
	if nextIndex < total {
		nc := base64.StdEncoding.EncodeToString([]byte(strconv.Itoa(nextIndex)))
		nextCursor = nc
	}

	// Ensure items is never nil in JSON (should be [])
	if paged == nil {
		paged = []map[string]interface{}{}
	}

	return map[string]interface{}{
		"ok": true,
		"result": map[string]interface{}{
			"items":  paged,
			"cursor": nextCursor,
			"total":  total,
		},
	}
}

func todosUpdate(args map[string]interface{}) map[string]interface{} {
	args = ensureArgs(args)
	id, _ := validateString(args, "id", true)
	title, hasTitle := validateString(args, "title", false)
	description, hasDesc := validateString(args, "description", false)
	dueDate, hasDue := validateString(args, "dueDate", false)
	labels, hasLabels := validateStringArray(args, "labels", false)
	completedVal, hasCompleted := validateBool(args, "completed", false)

	todosMu.Lock()
	todo, exists := todos[id]
	if !exists {
		todosMu.Unlock()
		return map[string]interface{}{
			"ok":    false,
			"error": map[string]interface{}{"code": "TODO_NOT_FOUND", "message": fmt.Sprintf("Todo with id '%s' not found", id)},
		}
	}

	updated := copyMap(todo)
	if hasTitle {
		updated["title"] = title
	}
	if hasDesc {
		updated["description"] = description
	}
	if hasDue {
		updated["dueDate"] = dueDate
	}
	if hasLabels {
		updated["labels"] = labels
	}
	if hasCompleted {
		updated["completed"] = completedVal
	}
	updated["updatedAt"] = nowISO()
	todos[id] = updated
	todosMu.Unlock()

	broadcast("updated", map[string]interface{}{"event": "updated", "todo": copyMap(updated), "timestamp": updated["updatedAt"]})
	return map[string]interface{}{"ok": true, "result": updated}
}

func todosDelete(args map[string]interface{}) map[string]interface{} {
	args = ensureArgs(args)
	id, _ := validateString(args, "id", true)

	todosMu.Lock()
	_, exists := todos[id]
	if !exists {
		todosMu.Unlock()
		return map[string]interface{}{
			"ok":    false,
			"error": map[string]interface{}{"code": "TODO_NOT_FOUND", "message": fmt.Sprintf("Todo with id '%s' not found", id)},
		}
	}
	delete(todos, id)
	// Remove from order
	for i, oid := range todoOrder {
		if oid == id {
			todoOrder = append(todoOrder[:i], todoOrder[i+1:]...)
			break
		}
	}
	todosMu.Unlock()

	broadcast("deleted", map[string]interface{}{"event": "deleted", "todoId": id, "timestamp": nowISO()})
	return map[string]interface{}{"ok": true, "result": map[string]interface{}{"deleted": true}}
}

func todosComplete(args map[string]interface{}) map[string]interface{} {
	args = ensureArgs(args)
	id, _ := validateString(args, "id", true)

	todosMu.Lock()
	todo, exists := todos[id]
	if !exists {
		todosMu.Unlock()
		return map[string]interface{}{
			"ok":    false,
			"error": map[string]interface{}{"code": "TODO_NOT_FOUND", "message": fmt.Sprintf("Todo with id '%s' not found", id)},
		}
	}

	if todo["completed"] == false {
		now := nowISO()
		todo["completed"] = true
		todo["completedAt"] = now
		todo["updatedAt"] = now
		todos[id] = todo
		todosMu.Unlock()
		broadcast("completed", map[string]interface{}{"event": "completed", "todo": copyMap(todo), "timestamp": now})
	} else {
		todosMu.Unlock()
	}

	return map[string]interface{}{"ok": true, "result": todo}
}

func todosExport(args map[string]interface{}, requestID string) map[string]interface{} {
	args = ensureArgs(args)
	format := validateEnum(args, "format", []string{"csv", "json"}, false, "csv")

	instance := createInstance(requestID, "v1:todos.export")

	time.AfterFunc(50*time.Millisecond, func() {
		transitionTo(requestID, "pending", nil)
		time.AfterFunc(50*time.Millisecond, func() {
			todosMu.RLock()
			items := make([]map[string]interface{}, 0)
			for _, id := range todoOrder {
				if t, ok := todos[id]; ok {
					items = append(items, t)
				}
			}
			todosMu.RUnlock()

			var data string
			if format == "csv" {
				header := "id,title,completed,createdAt"
				var rows []string
				for _, t := range items {
					completedStr := "false"
					if t["completed"] == true {
						completedStr = "true"
					}
					rows = append(rows, fmt.Sprintf("%s,%s,%s,%s", t["id"], t["title"], completedStr, t["createdAt"]))
				}
				all := append([]string{header}, rows...)
				data = strings.Join(all, "\n")
			} else {
				b, _ := json.Marshal(items)
				data = string(b)
			}

			chunks := buildChunks(data, 512)
			transitionTo(requestID, "complete", map[string]interface{}{
				"result": map[string]interface{}{
					"format": format,
					"data":   data,
					"count":  len(items),
				},
				"chunks": chunks,
			})
		})
	})

	return map[string]interface{}{"ok": true, "async": true, "requestId": instance.RequestID}
}

func reportsGenerate(args map[string]interface{}, requestID string) map[string]interface{} {
	args = ensureArgs(args)
	reportType := validateEnum(args, "type", []string{"summary", "detailed"}, false, "summary")

	instance := createInstance(requestID, "v1:reports.generate")

	time.AfterFunc(50*time.Millisecond, func() {
		transitionTo(requestID, "pending", nil)
		time.AfterFunc(50*time.Millisecond, func() {
			todosMu.RLock()
			items := make([]map[string]interface{}, 0, len(todos))
			for _, t := range todos {
				items = append(items, t)
			}
			todosMu.RUnlock()

			completedCount := 0
			for _, t := range items {
				if t["completed"] == true {
					completedCount++
				}
			}
			transitionTo(requestID, "complete", map[string]interface{}{
				"result": map[string]interface{}{
					"type":           reportType,
					"totalTodos":     len(items),
					"completedTodos": completedCount,
					"pendingTodos":   len(items) - completedCount,
					"generatedAt":    nowISO(),
				},
			})
		})
	})

	return map[string]interface{}{"ok": true, "async": true, "requestId": instance.RequestID}
}

func todosSearch(args map[string]interface{}) map[string]interface{} {
	args = ensureArgs(args)
	query, _ := validateString(args, "query", true)
	defaultLimit := intPtr(20)
	min := intPtr(1)
	max := intPtr(100)
	limit := validateInt(args, "limit", false, min, max, defaultLimit)

	todosMu.RLock()
	var items []map[string]interface{}
	for _, t := range todos {
		title, _ := t["title"].(string)
		if strings.Contains(strings.ToLower(title), strings.ToLower(query)) {
			items = append(items, t)
		}
	}
	todosMu.RUnlock()

	var paged []map[string]interface{}
	if limit < len(items) {
		paged = items[:limit]
	} else {
		paged = items
	}
	if paged == nil {
		paged = []map[string]interface{}{}
	}

	return map[string]interface{}{
		"ok": true,
		"result": map[string]interface{}{
			"items":  paged,
			"cursor": nil,
			"total":  len(items),
		},
	}
}

func debugSimulateError(args map[string]interface{}) map[string]interface{} {
	args = ensureArgs(args)
	statusCode := validateInt(args, "statusCode", true, nil, nil, nil)
	code, hasCode := validateString(args, "code", false)
	if !hasCode {
		code = "SIMULATED_ERROR"
	}
	message, hasMsg := validateString(args, "message", false)
	if !hasMsg {
		message = "Simulated error for testing"
	}
	panic(&ServerError{StatusCode: statusCode, Code: code, Msg: message})
}

func todosWatch(args map[string]interface{}) map[string]interface{} {
	args = ensureArgs(args)
	validateEnum(args, "filter", []string{"all", "completed", "pending"}, false, "all")
	sessionID := newUUID()
	registerStreamSession(sessionID)
	return map[string]interface{}{"ok": true, "stream": true, "sessionId": sessionID}
}

type mediaFile struct {
	Data        []byte
	ContentType string
	Filename    string
}

func todosAttach(args map[string]interface{}, mf *mediaFile) map[string]interface{} {
	args = ensureArgs(args)
	todoID, _ := validateString(args, "todoId", true)
	ref, hasRef := validateString(args, "ref", false)

	todosMu.Lock()
	todo, exists := todos[todoID]
	if !exists {
		todosMu.Unlock()
		return map[string]interface{}{
			"ok":    false,
			"error": map[string]interface{}{"code": "TODO_NOT_FOUND", "message": fmt.Sprintf("Todo with id '%s' not found", todoID)},
		}
	}

	// Handle ref URI
	if hasRef {
		media := storeMediaBlob([]byte{}, "application/octet-stream", ref)
		todo["attachmentId"] = media.ID
		todo["location"] = map[string]interface{}{"uri": "/media/" + media.ID}
		todo["updatedAt"] = nowISO()
		todos[todoID] = todo
		todosMu.Unlock()
		return map[string]interface{}{
			"ok": true,
			"result": map[string]interface{}{
				"todoId":       todoID,
				"attachmentId": media.ID,
				"contentType":  "application/octet-stream",
				"filename":     ref,
			},
		}
	}

	// Handle inline multipart upload
	if mf == nil {
		todosMu.Unlock()
		return map[string]interface{}{
			"ok":    false,
			"error": map[string]interface{}{"code": "MEDIA_REQUIRED", "message": "File upload or ref URI is required"},
		}
	}

	// Normalize content type (strip parameters like charset)
	baseContentType := strings.SplitN(mf.ContentType, ";", 2)[0]
	baseContentType = strings.TrimSpace(baseContentType)

	accepted := false
	for _, at := range acceptedMediaTypes {
		if at == baseContentType {
			accepted = true
			break
		}
	}
	if !accepted {
		todosMu.Unlock()
		return map[string]interface{}{
			"ok": false,
			"error": map[string]interface{}{
				"code":    "UNSUPPORTED_MEDIA_TYPE",
				"message": fmt.Sprintf("Unsupported media type: %s. Accepted: %s", baseContentType, strings.Join(acceptedMediaTypes, ", ")),
			},
		}
	}

	if len(mf.Data) > maxMediaBytes {
		todosMu.Unlock()
		return map[string]interface{}{
			"ok":    false,
			"error": map[string]interface{}{"code": "MEDIA_TOO_LARGE", "message": fmt.Sprintf("File exceeds maximum size of %d bytes", maxMediaBytes)},
		}
	}

	media := storeMediaBlob(mf.Data, baseContentType, mf.Filename)
	todo["attachmentId"] = media.ID
	todo["location"] = map[string]interface{}{"uri": "/media/" + media.ID}
	todo["updatedAt"] = nowISO()
	todos[todoID] = todo
	todosMu.Unlock()

	return map[string]interface{}{
		"ok": true,
		"result": map[string]interface{}{
			"todoId":       todoID,
			"attachmentId": media.ID,
			"contentType":  mf.ContentType,
			"filename":     mf.Filename,
		},
	}
}

// ---------------------------------------------------------------------------
// Operations registry (handler dispatch table)
// ---------------------------------------------------------------------------

type operationEntry struct {
	handler       func(args map[string]interface{}) map[string]interface{}
	asyncHandler  func(args map[string]interface{}, requestID string) map[string]interface{}
	streamHandler func(args map[string]interface{}) map[string]interface{}
	mediaHandler  func(args map[string]interface{}, mf *mediaFile) map[string]interface{}
	sideEffecting bool
	authScopes    []string
	executionModel string
	deprecated    bool
	sunset        string
	replacement   string
	acceptsMedia  bool
}

var operations = map[string]*operationEntry{
	"v1:todos.create": {
		handler:        todosCreate,
		sideEffecting:  true,
		authScopes:     []string{"todos:write"},
		executionModel: "sync",
	},
	"v1:todos.get": {
		handler:        todosGet,
		sideEffecting:  false,
		authScopes:     []string{"todos:read"},
		executionModel: "sync",
	},
	"v1:todos.list": {
		handler:        todosList,
		sideEffecting:  false,
		authScopes:     []string{"todos:read"},
		executionModel: "sync",
	},
	"v1:todos.update": {
		handler:        todosUpdate,
		sideEffecting:  true,
		authScopes:     []string{"todos:write"},
		executionModel: "sync",
	},
	"v1:todos.delete": {
		handler:        todosDelete,
		sideEffecting:  true,
		authScopes:     []string{"todos:write"},
		executionModel: "sync",
	},
	"v1:todos.complete": {
		handler:        todosComplete,
		sideEffecting:  true,
		authScopes:     []string{"todos:write"},
		executionModel: "sync",
	},
	"v1:todos.export": {
		asyncHandler:   todosExport,
		sideEffecting:  false,
		authScopes:     []string{"todos:read"},
		executionModel: "async",
	},
	"v1:reports.generate": {
		asyncHandler:   reportsGenerate,
		sideEffecting:  false,
		authScopes:     []string{"reports:read"},
		executionModel: "async",
	},
	"v1:todos.search": {
		handler:        todosSearch,
		sideEffecting:  false,
		authScopes:     []string{"todos:read"},
		executionModel: "sync",
		deprecated:     true,
		sunset:         "2025-01-01",
		replacement:    "v1:todos.list",
	},
	"v1:debug.simulateError": {
		handler:        debugSimulateError,
		sideEffecting:  false,
		authScopes:     []string{},
		executionModel: "sync",
	},
	"v1:todos.attach": {
		mediaHandler:   todosAttach,
		sideEffecting:  true,
		authScopes:     []string{"todos:write"},
		executionModel: "sync",
		acceptsMedia:   true,
	},
	"v1:todos.watch": {
		streamHandler:  todosWatch,
		sideEffecting:  false,
		authScopes:     []string{"todos:read"},
		executionModel: "stream",
	},
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func intPtr(i int) *int {
	return &i
}

func copyMap(m map[string]interface{}) map[string]interface{} {
	cp := make(map[string]interface{}, len(m))
	for k, v := range m {
		cp[k] = v
	}
	return cp
}
