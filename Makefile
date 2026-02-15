.PHONY: install build dev run task migrate tools history clean test up down logs restart status help

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
	@echo "🚀 Setting up Minions..."
	@if [ ! -f .env ]; then cp .env.example .env; echo "✅ Created .env file"; fi
	@echo "✅ Setup complete! Edit .env if needed, then run 'make up' to start services"

# 🏗️ Build & Development
build: node_modules
	npx tsc

node_modules: package.json
	npm install
	@touch node_modules

dev: build
	npx tsx src/cli.ts $(ARGS)

test:
	@echo "🧪 Running tests..."
	npm run build
	@echo "✅ Build test passed"

# 🐳 Podman Services
up:
	@echo "🚀 Starting services with Podman..."
	podman run -d \
		--name $(CONTAINER_NAME) \
		--network=host \
		-e POSTGRES_PASSWORD=$(POSTGRES_PASSWORD) \
		-v minions-data:/var/lib/postgresql/data \
		docker.io/library/postgres:15-alpine
	@echo "⏳ Waiting for PostgreSQL to start..."
	@sleep 3
	$(MAKE) migrate
	@echo "✅ Services started! PostgreSQL running on :5432"

down:
	@echo "🛑 Stopping services..."
	podman stop $(CONTAINER_NAME) || true
	podman rm $(CONTAINER_NAME) || true
	@echo "✅ Services stopped"

restart: down up

logs:
	podman logs -f $(CONTAINER_NAME)

# 🗃️ Database Operations
migrate:
	@echo "🗃️ Running database migrations..."
	@until psql "$(DATABASE_URL)" -c '\q' 2>/dev/null; do \
		echo "⏳ Waiting for database..."; \
		sleep 1; \
	done
	psql "$(DATABASE_URL)" -f migrations/001_initial.sql
	@echo "✅ Database migrations complete"

db-reset:
	@echo "⚠️ Resetting database..."
	psql "$(DATABASE_URL)" -c "DROP SCHEMA IF EXISTS minions CASCADE; CREATE SCHEMA minions;"
	$(MAKE) migrate

# 🤖 Minions Operations
run task:
	npx tsx src/cli.ts run "$(TASK)"

tools:
	npx tsx src/cli.ts tools

history:
	npx tsx src/cli.ts history

show:
	npx tsx src/cli.ts show $(ID)

# 🐳 Container Operations
image:
	@echo "🐳 Building Minions container image..."
	podman build -t $(IMAGE_NAME) .

run-container: image
	podman run --rm -it \
		--network=host \
		-e DATABASE_URL=$(DATABASE_URL) \
		-e ANTHROPIC_API_KEY=$(ANTHROPIC_API_KEY) \
		$(IMAGE_NAME) node dist/cli.js run "$(TASK)"

# 🧹 Cleanup
clean: down
	podman volume rm minions-data || true
	podman rmi $(IMAGE_NAME) || true
	rm -rf dist node_modules

# 📊 Status & Info
status:
	@echo "📊 Minions System Status"
	@echo "========================"
	@podman ps -a | grep minions || echo "No containers running"
	@echo ""
	@psql "$(DATABASE_URL)" -c "SELECT COUNT(*) as total_runs FROM minions.runs;" 2>/dev/null || echo "Database not accessible"

help:
	@echo "🤖 Minions - Universal Agent Orchestration"
	@echo "===========================================" 
	@echo ""
	@echo "Setup Commands:"
	@echo "  make setup     - Install dependencies and create .env"
	@echo "  make up        - Start PostgreSQL with Podman"
	@echo "  make down      - Stop all services"
	@echo "  make migrate   - Run database migrations"
	@echo ""
	@echo "Development:"
	@echo "  make build     - Build TypeScript"
	@echo "  make dev       - Development mode"
	@echo "  make test      - Run tests"
	@echo ""
	@echo "Minions Operations:"
	@echo "  make task TASK='...'         - Execute a task"
	@echo "  make run TASK='...'          - (alias for task)"
	@echo "  make run-container TASK='..' - Run task in container"
	@echo "  make tools                   - List available tools"
	@echo "  make history                 - Show run history"
	@echo "  make show ID=...             - Show run details"
	@echo ""
	@echo "Container Operations:"
	@echo "  make image           - Build container image"
	@echo ""
	@echo "Maintenance:"
	@echo "  make status    - Show system status"
	@echo "  make logs      - Show PostgreSQL logs"
	@echo "  make clean     - Full cleanup (containers, images, build files)"
