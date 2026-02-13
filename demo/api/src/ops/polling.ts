import { getOperationState, updateLastPolled } from "../services/lifecycle.ts";

/** Rate-limiting: track last poll time per requestId in memory */
const lastPollTimes = new Map<string, number>();

/**
 * Handle GET /ops/{requestId} — poll for async operation status.
 *
 * Returns appropriate envelope based on operation state:
 * - accepted: 202 with location and retryAfterMs
 * - pending: 200 with retryAfterMs
 * - complete: 200 with result location
 * - error: 200 with error details
 *
 * Returns 404 if operation not found.
 * Returns 429 if polled within 500ms of last poll.
 */
export function handlePolling(requestId: string): Response {
  // Look up operation state
  const op = getOperationState(requestId);

  if (!op) {
    return new Response(
      JSON.stringify({
        requestId,
        state: "error",
        error: {
          code: "OPERATION_NOT_FOUND",
          message: `Operation ${requestId} not found`,
        },
      }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  // Rate limiting: 429 if polled within 500ms
  const now = Date.now();
  const lastPoll = lastPollTimes.get(requestId);
  if (lastPoll !== undefined && now - lastPoll < 500) {
    return new Response(
      JSON.stringify({
        requestId,
        state: op.state,
        retryAfterMs: 500 - (now - lastPoll),
      }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }

  // Update poll tracking
  lastPollTimes.set(requestId, now);
  updateLastPolled(requestId);

  // Build response based on state
  switch (op.state) {
    case "accepted": {
      return new Response(
        JSON.stringify({
          requestId,
          sessionId: op.sessionId ?? undefined,
          state: "accepted",
          location: { uri: `/ops/${requestId}` },
          retryAfterMs: 1000,
        }),
        { status: 202, headers: { "Content-Type": "application/json" } }
      );
    }

    case "pending": {
      return new Response(
        JSON.stringify({
          requestId,
          sessionId: op.sessionId ?? undefined,
          state: "pending",
          retryAfterMs: 1000,
        }),
        { status: 202, headers: { "Content-Type": "application/json" } }
      );
    }

    case "complete": {
      return new Response(
        JSON.stringify({
          requestId,
          sessionId: op.sessionId ?? undefined,
          state: "complete",
          location: { uri: op.resultLocation },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    case "error": {
      return new Response(
        JSON.stringify({
          requestId,
          sessionId: op.sessionId ?? undefined,
          state: "error",
          error: op.error ?? {
            code: "OPERATION_FAILED",
            message: "The operation failed",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    default: {
      return new Response(
        JSON.stringify({
          requestId,
          state: "error",
          error: {
            code: "UNKNOWN_STATE",
            message: `Unknown operation state: ${op.state}`,
          },
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }
}
