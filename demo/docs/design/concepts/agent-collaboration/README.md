# Agent Collaboration

**Level**: 🏗️ Building
**Complexity**: 🟨 Moderate
**Convergence**: 🟠 Evolving
**Design**: 🟡 Partial
**Depends on**: [scope-enforcement](../scope-enforcement/README.md) (`items:checkin` scope)

## Summary

The demo demonstrates how AI agents and humans collaborate through the OpenCALL protocol. Agents have limited capabilities (no physical-world actions), forcing collaboration patterns that emerge naturally from protocol signals.

## The Collaboration Arc

The demo narrative follows a specific arc that showcases protocol-driven collaboration:

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Agent: "I'll reserve that book for you"                      │
│    → POST /call { op: "v1:item.reserve", args: { itemId } }     │
│    ← 200 { state: "error", error: { code: "OVERDUE_ITEMS_EXIST" │
│           message: "You have 2 overdue items..." }}              │
├─────────────────────────────────────────────────────────────────┤
│ 2. Agent: "Let me check your account"                           │
│    → POST /call { op: "v1:patron.get" }                         │
│    ← 200 { state: "complete", result: { overdueItems: [...] }}  │
├─────────────────────────────────────────────────────────────────┤
│ 3. Agent: "I'll return those items for you"                     │
│    → POST /call { op: "v1:item.return", args: { itemId } }      │
│    ← 403 { state: "error", error: { code: "INSUFFICIENT_SCOPES" │
│           message: "Missing scope: items:checkin" }}             │
├─────────────────────────────────────────────────────────────────┤
│ 4. Agent: "I can't physically return books. You'll need to      │
│           return them yourself, then I can reserve."            │
├─────────────────────────────────────────────────────────────────┤
│ 5. Human: Returns books via /account page                       │
├─────────────────────────────────────────────────────────────────┤
│ 6. Human: "OK, I returned them"                                 │
├─────────────────────────────────────────────────────────────────┤
│ 7. Agent: "Great, let me try again"                             │
│    → POST /call { op: "v1:item.reserve", args: { itemId } }     │
│    ← 200 { state: "complete", result: { reservationId: "..." }} │
└─────────────────────────────────────────────────────────────────┘
```

## Protocol Layers Demonstrated

The arc showcases three distinct protocol layers:

| Step | Layer | HTTP | State | Error Code |
|------|-------|------|-------|------------|
| 1 | Domain Error | 200 | error | OVERDUE_ITEMS_EXIST |
| 3 | Scope Error | 403 | error | INSUFFICIENT_SCOPES |
| 7 | Success | 200 | complete | — |

## Why This Matters

This collaboration pattern proves several things about OpenCALL:

1. **Self-describing** — Agent discovers everything from protocol signals
2. **Clear boundaries** — Physical vs digital actions have different scopes
3. **Actionable errors** — Error messages guide the agent's next step
4. **No scripting needed** — Agent instructions don't pre-script workflows

## Agent Capabilities

| Action | Agent Can Do? | Why |
|--------|---------------|-----|
| Browse catalog | ✅ Yes | Digital action, `items:browse` scope |
| View item details | ✅ Yes | Digital action, `items:read` scope |
| Reserve items | ✅ Yes | Digital action, `items:write` scope |
| Return items | ❌ No | Physical action, no `items:checkin` scope |
| Generate reports | ❌ No | No `reports:generate` scope |
| View fines | ❌ No | No `patron:billing` scope |

## Library Card Handoff

The agent-human collaboration starts with the library card number:

1. Human authenticates via `/auth` → gets card number displayed
2. Human shares card number with agent (out-of-band)
3. Agent authenticates via `POST /auth/agent { cardNumber }`
4. Agent receives limited-scope token
5. Agent acts as that patron with restricted capabilities

## Design Principles

1. **Physical-world boundaries** — Agents can't do physical actions
2. **Clear scope limits** — Agent learns capabilities from 403 errors
3. **Graceful degradation** — Agent explains what it can't do
4. **Human in the loop** — Some actions require human intervention
