/** Rate-limiting: track last poll time per requestId in memory */
const lastPollTimes = new Map<string, number>();

/** Minimum interval between polls per requestId (1 second) */
const RATE_LIMIT_MS = 1000;

/**
 * Check rate limit for a requestId. If within the limit, records the
 * current time and returns null. If exceeded, returns a 429 Response.
 */
export function checkRateLimit(requestId: string): Response | null {
  const now = Date.now();
  const lastPoll = lastPollTimes.get(requestId);

  if (lastPoll !== undefined && now - lastPoll < RATE_LIMIT_MS) {
    return new Response(
      JSON.stringify({
        requestId,
        state: "error",
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Please wait before polling again.",
        },
        retryAfterMs: RATE_LIMIT_MS - (now - lastPoll),
      }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }

  lastPollTimes.set(requestId, now);
  return null;
}
