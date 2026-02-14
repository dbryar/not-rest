#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "=========================================="
echo "OpenCALL Demo Library - Local Development"
echo "=========================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Local ports per design spec
API_PORT=3000
APP_PORT=8000
WWW_PORT=8080
AGENTS_PORT=8888

# URLs for cross-service communication
API_URL="http://localhost:$API_PORT"
APP_URL="http://localhost:$APP_PORT"
WWW_URL="http://localhost:$WWW_PORT"
AGENTS_URL="http://localhost:$AGENTS_PORT"

# Kill any existing servers
echo -e "${YELLOW}Stopping any existing servers...${NC}"
pkill -f "bun run src/server.ts" 2>/dev/null || true
sleep 1

# Seed database if needed
if [ ! -f "api/library.db" ]; then
    echo -e "${YELLOW}Seeding database...${NC}"
    cd api && bun run seed && cd ..
fi

# Start API server
echo -e "${YELLOW}Starting API server on port $API_PORT...${NC}"
cd api
PORT=$API_PORT APP_URL=$APP_URL ADMIN_SECRET=demo-admin-secret bun run src/server.ts &
API_PID=$!
cd ..

sleep 2

# Start Agents server
echo -e "${YELLOW}Starting Agents server on port $AGENTS_PORT...${NC}"
cd agents
PORT=$AGENTS_PORT API_URL=$API_URL bun run src/server.ts &
AGENTS_PID=$!
cd ..

sleep 1

# Start WWW server
echo -e "${YELLOW}Starting WWW server on port $WWW_PORT...${NC}"
cd www
PORT=$WWW_PORT APP_URL=$APP_URL API_URL=$API_URL bun run src/server.ts &
WWW_PID=$!
cd ..

sleep 1

# Start App server
echo -e "${YELLOW}Starting App server on port $APP_PORT...${NC}"
cd app
APP_PORT=$APP_PORT API_URL=$API_URL AGENTS_URL=$AGENTS_URL WWW_URL=$WWW_URL bun run src/server.ts &
APP_PID=$!
cd ..

sleep 2

# Check if servers are running
echo ""
echo -e "${YELLOW}Checking servers...${NC}"

if curl -s $API_URL/.well-known/ops > /dev/null 2>&1; then
    echo -e "${GREEN}✓ API server is running!${NC}"
else
    echo "✗ API server failed to start"
    exit 1
fi

if curl -s $AGENTS_URL/ > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Agents server is running!${NC}"
else
    echo "✗ Agents server failed to start"
    exit 1
fi

if curl -s $WWW_URL/ > /dev/null 2>&1; then
    echo -e "${GREEN}✓ WWW server is running!${NC}"
else
    echo "✗ WWW server failed to start"
    exit 1
fi

if curl -s $APP_URL/auth > /dev/null 2>&1; then
    echo -e "${GREEN}✓ App server is running!${NC}"
else
    echo "✗ App server failed to start"
    exit 1
fi

echo ""
echo "=========================================="
echo -e "${GREEN}OpenCALL Demo Library is running!${NC}"
echo "=========================================="
echo ""
echo "  Services:"
echo "    API:    $API_URL"
echo "    App:    $APP_URL"
echo "    WWW:    $WWW_URL"
echo "    Agents: $AGENTS_URL"
echo ""
echo "  Key URLs:"
echo "    Human Auth:      $APP_URL/auth"
echo "    Agent Instructions: $AGENTS_URL/"
echo "    API Registry:    $API_URL/.well-known/ops"
echo ""
echo "  Process IDs: API=$API_PID, App=$APP_PID, WWW=$WWW_PID, Agents=$AGENTS_PID"
echo ""
echo "  To stop: kill $API_PID $APP_PID $WWW_PID $AGENTS_PID"
echo ""

# Keep script running until Ctrl+C
trap "echo 'Stopping servers...'; kill $API_PID $APP_PID $WWW_PID $AGENTS_PID 2>/dev/null; exit 0" SIGINT SIGTERM

# Wait forever
wait
