# Minions - Architecture

## Overview

```
┌──────────────────────────────────────────────────────────┐
│                      ORCHESTRATOR                        │
│              Receives task → Plans → Delegates           │
│                                                          │
│  1. Parse task into phases (via Enhanced Planner)        │
│  2. Build DAG of agent dependencies                     │
│  3. Execute agents per phase (parallel or sequential)   │
│  4. Feed each agent ONLY its needed context             │
│  5. Collect results via Blackboard (PostgreSQL)         │
│  6. Synthesize final output                             │
└──────────────┬───────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────┐
│                 BLACKBOARD (PostgreSQL)                   │
│                                                          │
│  Tables:                                                 │
│  ├── runs         - Orchestration run history            │
│  ├── tasks        - Task definitions & status            │
│  ├── entries      - Agent findings (key-value + metadata)│
│  ├── artifacts    - Files/outputs produced               │
│  └── tools        - Registered tool/library definitions  │
│                                                          │
│  Indexes: entity, tag, date, agent, run_id               │
└──────────────┬───────────────────────────────────────────┘
               │
    ┌──────────┼──────────┐
    ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐
│Agent A │ │Agent B │ │Agent C │   ← Anthropic Messages API calls
│        │ │        │ │        │   ← Each gets minimal context
│        │ │        │ │        │   ← Results written to Blackboard
└────────┘ └────────┘ └────────┘
```

## Core Concepts

### 1. Orchestrator (The Brain)
- Receives a natural language task
- Uses the Enhanced Planner to decompose into a DAG of sub-tasks
- Assigns each sub-task to an agent
- Provides ONLY the context each agent needs (from the blackboard)
- Monitors progress and handles failures
- Synthesizes results into final deliverable

### 2. Blackboard (Shared Memory)
- PostgreSQL database (always available)
- Agents read/write findings as structured entries
- Indexed by entity, tag, date, and agent role
- Supports temporal queries (timeline construction)
- Persists across runs for learning/reference

### 3. Agents (The Workers)
- Each agent is a single call to the Anthropic Messages API (`POST /v1/messages`)
- Uses Node 22 native `fetch()` — no SDK dependency
- Each receives a focused prompt with:
  - Task description
  - Relevant blackboard context (NOT everything)
  - Available tools/libraries
  - Expected output format (JSON)
- Results are parsed from the LLM response and written to the blackboard
- Independent agents within a phase run in parallel

### 4. Enhanced Planner
- Heuristic task decomposition (no LLM call)
- Analyzes task text to identify domains, complexity, and agent roles
- Produces an `ExecutionPlan` with ordered phases and dependency edges
- Fallback: simpler `planner.ts` for basic tasks

### 5. Tools (Extensible Capabilities)
- Registered in PostgreSQL `tools` table
- Each tool has: name, description, usage instructions, install command
- Orchestrator selects relevant tools per agent task
- Agents receive tool instructions in their prompt context

## Database Schema

See `migrations/001_initial.sql` for full schema.

## File Structure

```
minions/
├── README.md                 # Quick start guide
├── Makefile                  # Build, test, run commands
├── Dockerfile                # Container build (node:22-slim)
├── .env.example              # Configuration template
├── .gitignore
├── .dockerignore
├── package.json              # Only runtime dep: pg
├── tsconfig.json
├── migrations/
│   └── 001_initial.sql       # PostgreSQL schema
├── src/
│   ├── orchestrator.ts       # Task decomposition & delegation
│   ├── agent.ts              # Anthropic Messages API calls + response parsing
│   ├── enhanced-planner.ts   # Heuristic DAG construction
│   ├── planner.ts            # Simpler fallback planner
│   ├── blackboard.ts         # PostgreSQL blackboard client
│   ├── types.ts              # Core type definitions
│   └── cli.ts                # CLI interface
├── docs/
│   ├── ARCHITECTURE.md       # This file
│   └── ROADMAP.md            # Planned iterations
└── tasks/
    └── todo.md               # Current task tracking
```
