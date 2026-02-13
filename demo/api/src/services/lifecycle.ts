import { createMachine, createActor } from "xstate";
import { getDb } from "../db/connection.ts";

// ── XState v5 state machine definition ──────────────────────────────────

type LifecycleEvent =
  | { type: "START" }
  | { type: "COMPLETE"; resultLocation: string }
  | { type: "FAIL"; message: string };

const lifecycleMachine = createMachine({
  id: "asyncOp",
  initial: "accepted",
  states: {
    accepted: {
      on: {
        START: { target: "pending" },
        FAIL: { target: "error" },
      },
    },
    pending: {
      on: {
        COMPLETE: { target: "complete" },
        FAIL: { target: "error" },
      },
    },
    complete: { type: "final" },
    error: { type: "final" },
  },
});

// ── Validate a transition using XState ──────────────────────────────────

/**
 * Given a current state name and an event, use XState to determine the
 * next state. Returns the next state name, or null if the transition
 * is not valid (i.e. the state did not change).
 */
function validateTransition(
  currentState: string,
  event: LifecycleEvent
): string | null {
  const snapshot = lifecycleMachine.resolveState({ value: currentState, context: {} });
  const actor = createActor(lifecycleMachine, { snapshot });
  actor.start();
  actor.send(event);
  const nextSnap = actor.getSnapshot();
  const nextValue = typeof nextSnap.value === "string" ? nextSnap.value : null;
  actor.stop();

  // If the state didn't change, the event was not handled
  if (nextValue === currentState) return null;
  return nextValue;
}

// ── Database operations ─────────────────────────────────────────────────

/**
 * Create a new async operation record in the database with state=accepted.
 */
export function createOperation(
  requestId: string,
  sessionId: string | undefined,
  op: string,
  args: unknown,
  patronId: string,
  ttlSeconds: number = 3600
): void {
  const db = getDb();
  const now = new Date().toISOString();
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;

  db.prepare(
    `INSERT INTO operations (request_id, session_id, op, args, patron_id, state, created_at, updated_at, expires_at)
     VALUES (?, ?, ?, ?, ?, 'accepted', ?, ?, ?)`
  ).run(
    requestId,
    sessionId ?? null,
    op,
    JSON.stringify(args),
    patronId,
    now,
    now,
    expiresAt
  );
}

/**
 * Transition an async operation to a new state.
 * Uses XState to validate that the transition is legal.
 */
export function transitionOperation(
  requestId: string,
  event: LifecycleEvent
): void {
  const db = getDb();
  const row = db
    .prepare("SELECT state FROM operations WHERE request_id = ?")
    .get(requestId) as { state: string } | null;

  if (!row) {
    throw new Error(`Operation ${requestId} not found`);
  }

  const nextState = validateTransition(row.state, event);
  if (!nextState) {
    throw new Error(
      `Invalid transition from '${row.state}' with event '${event.type}'`
    );
  }

  const now = new Date().toISOString();

  if (event.type === "COMPLETE") {
    db.prepare(
      `UPDATE operations SET state = ?, result_location = ?, updated_at = ? WHERE request_id = ?`
    ).run(nextState, event.resultLocation, now, requestId);
  } else if (event.type === "FAIL") {
    const errorObj = JSON.stringify({ code: "OPERATION_FAILED", message: event.message });
    db.prepare(
      `UPDATE operations SET state = ?, error = ?, updated_at = ? WHERE request_id = ?`
    ).run(nextState, errorObj, now, requestId);
  } else {
    db.prepare(
      `UPDATE operations SET state = ?, updated_at = ? WHERE request_id = ?`
    ).run(nextState, now, requestId);
  }
}

/**
 * Retrieve the current state of an async operation.
 */
export function getOperationState(
  requestId: string
): {
  requestId: string;
  sessionId: string | null;
  op: string;
  args: unknown;
  patronId: string;
  state: string;
  resultLocation: string | null;
  resultData: string | null;
  error: unknown | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: number;
  lastPolledAt: number | null;
} | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM operations WHERE request_id = ?")
    .get(requestId) as Record<string, unknown> | null;

  if (!row) return null;

  return {
    requestId: row.request_id as string,
    sessionId: (row.session_id as string) ?? null,
    op: row.op as string,
    args: row.args ? JSON.parse(row.args as string) : {},
    patronId: row.patron_id as string,
    state: row.state as string,
    resultLocation: (row.result_location as string) ?? null,
    resultData: (row.result_data as string) ?? null,
    error: row.error ? JSON.parse(row.error as string) : null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    expiresAt: row.expires_at as number,
    lastPolledAt: (row.last_polled_at as number) ?? null,
  };
}

/**
 * Update the last_polled_at timestamp for rate limiting.
 */
export function updateLastPolled(requestId: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE operations SET last_polled_at = ? WHERE request_id = ?"
  ).run(Date.now(), requestId);
}
