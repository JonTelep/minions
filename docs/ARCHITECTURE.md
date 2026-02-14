# Minions - Universal Agent Orchestration System

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                    ORCHESTRATOR (Opus 4.6)                │
│              Receives task → Plans → Delegates           │
│                                                          │
│  1. Parse task into phases                               │
│  2. Build DAG of agent dependencies                      │
│  3. Spin up Claude Code agents (Sonnet) per task         │
│  4. Feed each agent ONLY its needed context              │
│  5. Collect results via Blackboard (PostgreSQL)          │
│  6. Synthesize final output                              │
└──────────────┬───────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────┐
│                 BLACKBOARD (PostgreSQL)                   │
│                                                          │
│  Tables:                                                 │
│  ├── tasks        - Task definitions & status            │
│  ├── entries      - Agent findings (key-value + metadata)│
│  ├── artifacts    - Files/outputs produced               │
│  ├── runs         - Orchestration run history            │
│  └── tools        - Registered tool/library definitions  │
│                                                          │
│  Indexes: entity, tag, date, agent, run_id               │
└──────────────┬───────────────────────────────────────────┘
               │
    ┌──────────┼──────────┐
    ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐
│Agent A │ │Agent B │ │Agent C │   ← Claude Code (Sonnet)
│(Sonnet)│ │(Sonnet)│ │(Sonnet)│   ← Each gets minimal context
│        │ │        │ │        │   ← Reads/writes Blackboard
└────────┘ └────────┘ └────────┘
```

## Core Concepts

### 1. Orchestrator (The Brain)
- Runs as Opus 4.6 (Claude Code)
- Receives a natural language task
- Decomposes into a DAG of sub-tasks
- Assigns each sub-task to a Sonnet agent
- Provides ONLY the context each agent needs
- Monitors progress, handles failures, retries
- Synthesizes results into final deliverable

### 2. Blackboard (Shared Memory)
- PostgreSQL database on VPS (always available)
- Agents read/write findings as structured entries
- Indexed by entity, tag, date, and agent role
- Supports temporal queries (timeline construction)
- Persists across runs for learning/reference

### 3. Agents (The Workers)
- Spun up via Claude Code (Sonnet model)
- Each receives a focused prompt with:
  - Task description
  - Relevant blackboard context (NOT everything)
  - Available tools/libraries
  - Expected output format
- Write results back to blackboard
- Can be parallelized when independent

### 4. Tools/Libraries (Extensible Capabilities)
- Registered in PostgreSQL `tools` table
- Each tool has: name, description, usage instructions, install command
- Orchestrator selects relevant tools per agent task
- Agents receive tool instructions in their context
- Easy to add new tools without changing core code

## Key Differences from intelli-pulse

| Aspect | intelli-pulse | minions |
|--------|--------------|---------|
| Domain | Political intelligence only | Universal - any task |
| Agents | 7 hardcoded specialized agents | Dynamic - orchestrator creates agents per task |
| Blackboard | In-memory Map | PostgreSQL (persistent, queryable) |
| Execution | TypeScript process | Claude Code sessions (real shell access) |
| Tools | Hardcoded data sources | Extensible tool registry |
| DAG | Hardcoded 4-phase pipeline | Dynamic DAG per task |

## Database Schema

See `migrations/001_initial.sql` for full schema.

## File Structure

```
minions/
├── README.md                 # Quick start guide
├── Makefile                  # Build, test, run commands
├── Dockerfile                # Container build
├── .github/
│   └── PULL_REQUEST_TEMPLATE.md
├── docs/
│   ├── ARCHITECTURE.md       # This file
│   ├── ORCHESTRATION.md      # How orchestration works
│   ├── TOOLS.md              # Tool registry guide
│   └── decisions/
│       └── 000-template.md
├── migrations/
│   └── 001_initial.sql       # PostgreSQL schema
├── src/
│   ├── orchestrator.ts       # The brain - task decomposition & delegation
│   ├── blackboard.ts         # PostgreSQL blackboard client
│   ├── agent.ts              # Agent spawning & communication
│   ├── tools.ts              # Tool registry & management
│   ├── planner.ts            # DAG construction from natural language
│   ├── types.ts              # Core type definitions
│   └── cli.ts                # CLI interface
├── tools/                    # Built-in tool definitions
│   ├── web-search.json
│   ├── web-fetch.json
│   ├── github.json
│   ├── file-ops.json
│   └── database.json
├── tasks/
│   ├── todo.md
│   └── lessons.md
├── package.json
└── tsconfig.json
```
