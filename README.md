# Minions

**Universal agent orchestration system.** Decomposes complex tasks into specialized agents, orchestrates parallel execution via the Anthropic Messages API, and persists results to a PostgreSQL blackboard.

## Key Features

- **Intelligent Planning**: Heuristic task decomposition with domain analysis and DAG construction
- **Parallel Execution**: Multi-phase orchestration with configurable agent allocation
- **Real LLM Agents**: Each agent calls the Anthropic Messages API via native `fetch()` — no SDK needed
- **Persistent Blackboard**: PostgreSQL-backed shared memory across agents and runs
- **Minimal Dependencies**: Only runtime dep is `pg` — everything else is Node 22 built-ins

## Architecture

```
Task (natural language)
         │
         ▼
┌─────────────────┐
│  Enhanced Planner│ ── heuristic task decomposition into phases/DAG
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────────────┐
│   Orchestrator   │◄────►│  Blackboard (Postgres)│
└────────┬────────┘      └──────────────────────┘
         │
    ┌────┼────┐
    ▼    ▼    ▼
 Agent Agent Agent  ── each calls Anthropic Messages API
```

## Quick Start

### Prerequisites
- Node.js 22+ (for native `fetch()`)
- PostgreSQL database
- Podman (or Docker)
- Anthropic API key

### Setup

```bash
# Clone and setup
git clone https://github.com/jontelep/minions.git
cd minions

# Install dependencies
make install

# Set up environment
cp .env.example .env
# Edit .env — set ANTHROPIC_API_KEY and DATABASE_URL

# Start PostgreSQL (via Podman)
make up

# Build
make build

# Execute a task
node dist/cli.js run "What is 2+2? Return the answer as JSON."
```

### Usage

```bash
# Run a task (via make)
make task TASK="Give me a stock analysis of NVDA, suggest an honest belief of how it will perform"

# Or run directly
node dist/cli.js run "What is 2+2? Return the answer as JSON."

# Run inside a container (builds image first)
make run-container TASK="Summarize the pros and cons of Rust vs Go for web services"

# Other commands
make tools             # List registered tools
make history           # Show run history
make show ID=<run-id>  # Show run details
```

## System Components

| Component | File | Description |
|-----------|------|-------------|
| **Orchestrator** | `src/orchestrator.ts` | Plans, delegates, synthesizes results |
| **Agent** | `src/agent.ts` | Calls Anthropic Messages API, parses JSON responses |
| **Enhanced Planner** | `src/enhanced-planner.ts` | Heuristic task decomposition into execution DAGs |
| **Planner** | `src/planner.ts` | Simpler fallback planner |
| **Blackboard** | `src/blackboard.ts` | PostgreSQL shared memory layer |
| **Types** | `src/types.ts` | Core type definitions |
| **CLI** | `src/cli.ts` | Command-line interface |

## Development

```bash
make build         # Compile TypeScript
make dev           # Build + run via tsx
make test          # Build verification
make image         # Build container image
make clean         # Remove dist/ and node_modules/
make status        # Check system status
```

## Configuration

See `.env.example` for all options. Key settings:

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for agent execution |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `DEFAULT_MODEL` | No | Model ID (default: `anthropic/claude-sonnet-4-20250514`) |
| `AGENT_TIMEOUT` | No | Per-agent timeout in seconds (default: 300) |

## Documentation

- [Architecture Guide](docs/ARCHITECTURE.md) — System design and file structure
- [Roadmap](docs/ROADMAP.md) — Planned iterations

## License

MIT License - Telep IO LLC
