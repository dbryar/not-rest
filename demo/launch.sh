#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "OpenCALL Demo Library - Launch Script"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parse arguments
RUN_TESTS=false
REBUILD=false
SEED_DATA=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --test|-t)
      RUN_TESTS=true
      shift
      ;;
    --rebuild|-r)
      REBUILD=true
      shift
      ;;
    --seed|-s)
      SEED_DATA=true
      shift
      ;;
    --all|-a)
      RUN_TESTS=true
      SEED_DATA=true
      shift
      ;;
    --help|-h)
      echo "Usage: ./launch.sh [options]"
      echo ""
      echo "Options:"
      echo "  -t, --test     Run integration tests after starting"
      echo "  -r, --rebuild  Force rebuild of containers"
      echo "  -s, --seed     Seed database with test data"
      echo "  -a, --all      Enable all options (test + seed)"
      echo "  -h, --help     Show this help message"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Check for docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: docker is not installed${NC}"
    exit 1
fi

# Check for docker compose
if ! docker compose version &> /dev/null; then
    echo -e "${RED}Error: docker compose is not available${NC}"
    exit 1
fi

# Stop existing containers if running
echo -e "${YELLOW}Stopping existing containers...${NC}"
docker compose down --remove-orphans 2>/dev/null || true

# Build containers
if [ "$REBUILD" = true ]; then
    echo -e "${YELLOW}Rebuilding containers...${NC}"
    docker compose build --no-cache
else
    echo -e "${YELLOW}Building containers...${NC}"
    docker compose build
fi

# Start containers
echo -e "${YELLOW}Starting containers...${NC}"
docker compose up -d

# Wait for API to be healthy
echo -e "${YELLOW}Waiting for API server to be ready...${NC}"
max_attempts=30
attempt=0
while [ $attempt -lt $max_attempts ]; do
    if curl -s http://localhost:8080/.well-known/ops > /dev/null 2>&1; then
        echo -e "${GREEN}API server is ready!${NC}"
        break
    fi
    attempt=$((attempt + 1))
    sleep 1
done

if [ $attempt -eq $max_attempts ]; then
    echo -e "${RED}API server failed to start${NC}"
    docker compose logs api
    exit 1
fi

# Wait for App to be ready
echo -e "${YELLOW}Waiting for App server to be ready...${NC}"
attempt=0
while [ $attempt -lt $max_attempts ]; do
    if curl -s http://localhost:3000/auth > /dev/null 2>&1; then
        echo -e "${GREEN}App server is ready!${NC}"
        break
    fi
    attempt=$((attempt + 1))
    sleep 1
done

if [ $attempt -eq $max_attempts ]; then
    echo -e "${RED}App server failed to start${NC}"
    docker compose logs app
    exit 1
fi

# Seed database if requested
if [ "$SEED_DATA" = true ]; then
    echo -e "${YELLOW}Seeding database...${NC}"
    docker compose exec -T api bun run seed
    echo -e "${GREEN}Database seeded!${NC}"
fi

# Run tests if requested
if [ "$RUN_TESTS" = true ]; then
    echo ""
    echo -e "${YELLOW}Running integration tests...${NC}"
    echo "=========================================="

    # Set environment for tests to use running containers
    export TEST_API_URL="http://localhost:8080"
    export TEST_APP_URL="http://localhost:3000"

    # Run API tests
    echo -e "${YELLOW}Running API tests...${NC}"
    cd api && bun test && cd ..

    # Run App tests
    echo -e "${YELLOW}Running App tests...${NC}"
    cd app && bun test && cd ..

    echo ""
    echo -e "${GREEN}All tests passed!${NC}"
fi

echo ""
echo "=========================================="
echo -e "${GREEN}OpenCALL Demo Library is running!${NC}"
echo "=========================================="
echo ""
echo "  API Server:  http://localhost:8080"
echo "  App Server:  http://localhost:3000"
echo ""
echo "  API Registry: http://localhost:8080/.well-known/ops"
echo "  Auth Page:    http://localhost:3000/auth"
echo ""
echo "To stop: docker compose down"
echo "To view logs: docker compose logs -f"
echo ""
