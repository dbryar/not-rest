package opencall;

import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Token store and auth validation for the OpenCALL Todo API.
 */
public final class Auth {

    public record TokenEntry(List<String> scopes) {}

    public record AuthResult(
        boolean valid,
        int status,
        String code,
        String message
    ) {
        public static AuthResult ok() {
            return new AuthResult(true, 0, null, null);
        }

        public static AuthResult fail(int status, String code, String message) {
            return new AuthResult(false, status, code, message);
        }
    }

    private static ConcurrentHashMap<String, TokenEntry> tokenStore = new ConcurrentHashMap<>();

    public static void registerToken(String token, List<String> scopes) {
        tokenStore.put(token, new TokenEntry(scopes));
    }

    public static void resetTokenStore() {
        tokenStore = new ConcurrentHashMap<>();
    }

    public static AuthResult validateAuth(String authHeader, List<String> requiredScopes) {
        if (requiredScopes == null || requiredScopes.isEmpty()) {
            return AuthResult.ok();
        }

        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return AuthResult.fail(401, "AUTH_REQUIRED",
                "Authorization header with Bearer token is required");
        }

        String token = authHeader.substring(7);
        TokenEntry entry = tokenStore.get(token);

        if (entry == null) {
            return AuthResult.fail(401, "AUTH_REQUIRED",
                "Invalid or expired token");
        }

        boolean hasAllScopes = requiredScopes.stream()
            .allMatch(scope -> entry.scopes().contains(scope));

        if (!hasAllScopes) {
            return AuthResult.fail(403, "INSUFFICIENT_SCOPE",
                "Token lacks required scopes: " + String.join(", ", requiredScopes));
        }

        return AuthResult.ok();
    }
}
