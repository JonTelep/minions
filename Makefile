.PHONY: install build dev run task migrate tools history runs results clean test up down logs restart status help

# Default target — just typing `make` prints help
.DEFAULT_GOAL := help

# Load environment variables
ifneq (,$(wildcard ./.env))
    include .env
    export
endif

DATABASE_URL ?= postgresql://postgres:postgres@localhost:5432/postgres
CONTAINER_NAME ?= minions-postgres
IMAGE_NAME ?= minions
POSTGRES_PASSWORD ?= postgres

# 📦 Installation & Setup
install:
	npm install

setup: install
	@echo "Setting up Minions..."
	@if [ ! -f .env ]; then cp .env.example .env; echo "Created .env file"; fi
	@echo "Setup complete! Edit .env if needed, then run 'make up' to start services"

# 🏗️ Build & Development
build: node_modules
	npx tsc

node_modules: package.json
	npm install
	@touch node_modules

dev: build
	npx tsx src/cli.ts $(ARGS)

test:
	@echo "Running tests..."
	npm run build
	@echo "Build test passed"

# Podman Services
up:
	@echo "Starting PostgreSQL with Podman..."
	podman run -d \
		--name $(CONTAINER_NAME) \
		--network=host \
		-e POSTGRES_PASSWORD=$(POSTGRES_PASSWORD) \
		-v minions-data:/var/lib/postgresql/data \
		docker.io/library/postgres:15-alpine
	@echo "Waiting for PostgreSQL to start..."
	@sleep 3
	$(MAKE) migrate
	@echo "PostgreSQL running on :5432"

down:
	@echo "Stopping services..."
	podman stop $(CONTAINER_NAME) || true
	podman rm $(CONTAINER_NAME) || true
	@echo "Services stopped"

restart: down up

logs:
	podman logs -f $(CONTAINER_NAME)

# Database Operations
migrate:
	@echo "Running database migrations..."
	@until psql "$(DATABASE_URL)" -c '\q' 2>/dev/null; do \
		echo "Waiting for database..."; \
		sleep 1; \
	done
	psql "$(DATABASE_URL)" -f migrations/001_initial.sql
	@echo "Database migrations complete"

db-reset:
	@echo "Resetting database..."
	psql "$(DATABASE_URL)" -c "DROP SCHEMA IF EXISTS minions CASCADE; CREATE SCHEMA minions;"
	$(MAKE) migrate

# Minions Operations
run task:
	npx tsx src/cli.ts run "$(TASK)"

tools:
	npx tsx src/cli.ts tools

history:
	npx tsx src/cli.ts history

show:
	npx tsx src/cli.ts show $(ID)

# Database Queries
runs:
	@psql "$(DATABASE_URL)" -c "\
		SELECT id, status, \
			LEFT(task, 60) AS task, \
			TO_CHAR(started_at, 'YYYY-MM-DD HH24:MI') AS started, \
			COALESCE(execution_time_ms || 'ms', '-') AS duration \
		FROM minions.runs \
		ORDER BY started_at DESC \
		LIMIT 20;"

results:
	@psql "$(DATABASE_URL)" -c "\
		SELECT r.id, r.status, \
			LEFT(r.task, 40) AS task, \
			COUNT(t.id) AS agents, \
			COUNT(t.id) FILTER (WHERE t.status = 'completed') AS ok, \
			COUNT(t.id) FILTER (WHERE t.status = 'failed') AS failed, \
			COALESCE(r.execution_time_ms || 'ms', '-') AS duration \
		FROM minions.runs r \
		LEFT JOIN minions.tasks t ON t.run_id = r.id \
		GROUP BY r.id, r.status, r.task, r.started_at, r.execution_time_ms \
		ORDER BY r.started_at DESC \
		LIMIT 20;"

entries:
	@psql "$(DATABASE_URL)" -c "\
		SELECT e.key, e.written_by, e.tags, \
			LEFT(e.value::text, 80) AS value, \
			TO_CHAR(e.created_at, 'YYYY-MM-DD HH24:MI') AS created \
		FROM minions.entries e \
		ORDER BY e.created_at DESC \
		LIMIT 20;"

# Container Operations
image:
	@echo "Building Minions container image..."
	podman build -t $(IMAGE_NAME) .

run-container: image
	podman run --rm -it \
		--network=host \
		-e DATABASE_URL=$(DATABASE_URL) \
		-e ANTHROPIC_API_KEY=$(ANTHROPIC_API_KEY) \
		$(IMAGE_NAME) node dist/cli.js run "$(TASK)"

# Cleanup
clean: down
	podman volume rm minions-data || true
	podman rmi $(IMAGE_NAME) || true
	rm -rf dist node_modules

# Status & Info
status:
	@echo "Minions System Status"
	@echo "====================="
	@podman ps -a | grep minions || echo "No containers running"
	@echo ""
	@psql "$(DATABASE_URL)" -c "SELECT COUNT(*) as total_runs FROM minions.runs;" 2>/dev/null || echo "Database not accessible"

help:
	@echo "Minions - Universal Agent Orchestration"
	@echo "========================================"
	@echo ""
	@echo "Setup:"
	@echo "  make setup                   Install deps and create .env"
	@echo "  make up                      Start PostgreSQL (Podman)"
	@echo "  make down                    Stop PostgreSQL"
	@echo "  make migrate                 Run database migrations"
	@echo ""
	@echo "Build:"
	@echo "  make build                   Compile TypeScript (auto-installs deps)"
	@echo "  make test                    Build verification"
	@echo "  make image                   Build container image"
	@echo ""
	@echo "Run Tasks:"
	@echo "  make task TASK='...'         Execute a task"
	@echo "  make run-container TASK='..' Run task in container"
	@echo ""
	@echo "Query Database:"
	@echo "  make runs                    List recent runs"
	@echo "  make results                 List runs with agent pass/fail counts"
	@echo "  make entries                 List recent blackboard entries"
	@echo "  make history                 Show run history (via CLI)"
	@echo "  make show ID=<uuid>          Show full run details (via CLI)"
	@echo ""
	@echo "Maintenance:"
	@echo "  make status                  System status"
	@echo "  make logs                    PostgreSQL logs"
	@echo "  make db-reset                Drop and recreate schema"
	@echo "  make clean                   Full teardown (containers, volumes, build)"
