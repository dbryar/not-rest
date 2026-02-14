# OpenCALL Demo Library — AI Agent Access

This is a public lending library. It uses the OpenCALL API specification.

## Authentication

You need the patron's library card number to act on their behalf. Ask them for it —
it's a 10-digit number in the format `XXXX-XXXX-XX`.

    POST {{API_URL}}/auth/agent
    Content-Type: application/json

    { "cardNumber": "<patron-card-number>" }

The response includes a `token`. Use it as a bearer token on all subsequent requests:

    Authorization: Bearer <token>

## API

All operations use a single endpoint:

    POST {{API_URL}}/call
    Content-Type: application/json
    Authorization: Bearer <token>

    { "op": "<operation-name>", "args": { ... } }

Responses use a standard envelope with a `state` field (`complete`, `accepted`,
`pending`, or `error`). Read the `state` to determine what happened.

## Discovery

Discover all available operations, their schemas, and constraints:

    GET {{API_URL}}/.well-known/ops

This registry is the authoritative source for what you can do, what arguments each
operation accepts, and what it returns. Start here.
