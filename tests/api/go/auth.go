package main

import (
	"strings"
	"sync"
)

type tokenEntry struct {
	scopes []string
}

type authResult struct {
	Valid   bool
	Status int
	Code   string
	Message string
}

var (
	tokenStore   = make(map[string]*tokenEntry)
	tokenStoreMu sync.RWMutex
)

func registerToken(token string, scopes []string) {
	tokenStoreMu.Lock()
	defer tokenStoreMu.Unlock()
	tokenStore[token] = &tokenEntry{scopes: scopes}
}

func resetTokenStore() {
	tokenStoreMu.Lock()
	defer tokenStoreMu.Unlock()
	tokenStore = make(map[string]*tokenEntry)
}

func validateAuth(authHeader string, requiredScopes []string) authResult {
	if len(requiredScopes) == 0 {
		return authResult{Valid: true}
	}

	if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
		return authResult{
			Valid:   false,
			Status:  401,
			Code:    "AUTH_REQUIRED",
			Message: "Authorization header with Bearer token is required",
		}
	}

	token := authHeader[7:]

	tokenStoreMu.RLock()
	entry, exists := tokenStore[token]
	tokenStoreMu.RUnlock()

	if !exists {
		return authResult{
			Valid:   false,
			Status:  401,
			Code:    "AUTH_REQUIRED",
			Message: "Invalid or expired token",
		}
	}

	for _, required := range requiredScopes {
		found := false
		for _, scope := range entry.scopes {
			if scope == required {
				found = true
				break
			}
		}
		if !found {
			return authResult{
				Valid:   false,
				Status:  403,
				Code:    "INSUFFICIENT_SCOPE",
				Message: "Token lacks required scopes: " + strings.Join(requiredScopes, ", "),
			}
		}
	}

	return authResult{Valid: true}
}
