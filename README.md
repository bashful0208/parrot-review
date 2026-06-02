# Reviewer - AI-Powered Code Review System

An intelligent code review system based on multiple AI agents, supporting automatic PR review for GitHub, Gitee, and GitLab. Using LangGraph to orchestrate multiple AI agents for parallel quality and security reviews, automatically posting review comments to PRs.

## Core Features

- **Multi-Platform Support** - Webhook integration for GitHub, Gitee, and GitLab
- **Intelligent Review** - Multi-agent parallel review pipeline based on LangGraph
  - Quality Reviewer
  - Security Reviewer
  - Error Handler Reviewer
- **Review Feedback** - Automatically post review comments to PRs (supports inline comments)
- **Usage Tracking** - Track token consumption and costs for each review
- **Web Dashboard** - Repository management, AI provider configuration, review history
- **Checkpoint Recovery** - LangGraph checkpoint persistence, supports resuming interrupted reviews

## Architecture

```
GitHub/Gitee/GitLab ──webhook──▶ apps/web (Next.js) ──Redis──▶ apps/worker (BullMQ)
                                      │                              │
                                      ▼                              │
                                 PostgreSQL ◀─────────────────────────┘
                            (Business data + LangGraph checkpoints)
                                      │
                                      ▼
                            ┌─────────────────┐
                            │   AI Providers  │
                            │  Anthropic/OpenAI│
                            └─────────────────┘
```

**Review Pipeline Topology:**
```
                         ┌─ quality_reviewer ──────────┐
START ──┤── security_reviewer ──────────┤── aggregator ──┐
                         └─ error_handler_reviewer ────┘                │
                                                                                         │
               ┌─────────────────────────────────────────────────────────┘
               ▼
     fanOutFindings (routing logic)
        ├─ Has pending findings → Parallel Send to critic (one per finding)
        │     └─ critic: while loop (max MAX_REFLECTION_ATTEMPTS=2 rounds)
        │           ├─ verifyFinding → valid=true → approved
        │           └─ verifyFinding → valid=false → regenerateFinding → retry
        │                                           └─ Exhausted → exhausted (fallback to patchedFinding)
        └─ No pending findings → Direct to collect_findings
               ▼
     collect_findings (collect approved + exhausted)
               ▼
     summarizer (generate final review summary)
               ▼
             END
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, shadcn/ui |
| Backend Worker | Node.js, BullMQ, ioredis |
| AI/ML | LangGraph, Anthropic SDK, OpenAI SDK |
| Database | PostgreSQL 16 |
| Cache/Queue | Redis 7 |
| Git Integration | Octokit (GitHub), Custom clients (Gitee/GitLab) |

## Directory Structure

```text
reviewer/
├── apps/
│   ├── web/                    # Next.js frontend application
│   │   ├── src/app/            # App Router pages and API routes
│   │   └── components/         # React components
│   └── worker/                 # BullMQ background worker
│       └── src/handlers/       # Task handlers
├── packages/
│   ├── ai/                     # LangGraph review pipeline, LLM adapters
│   │   └── src/graph/          # Review graph nodes and state definitions
│   ├── core/                   # Shared core: auth, config, error handling, logging
│   ├── db-types/               # Database type definitions
│   ├── git/                    # Git platform abstraction layer
│   └── shared/                 # Shared types
├── postgres/
│   └── migrations/             # Database migration files
├── scripts/                    # Development and deployment scripts
├── doc/                        # Design documents and research reports
├── docs/                       # User documentation
└── tests/                      # Integration tests
```

## Quick Start

### Option 1: Docker Compose (Recommended)

**Full Deployment** (PostgreSQL + Redis + Web + Worker):

```bash
cp .env.example .env
# Edit .env with your configuration
docker compose up -d
```

**Development Only** (Only start PostgreSQL + Redis, run Web/Worker on host):

```bash
docker compose -f docker-compose.dev.yml up -d
```

### Option 2: Local Development (pnpm)

Prerequisites: PostgreSQL and Redis are running (you can use `docker compose -f docker-compose.dev.yml up -d`).

```bash
cp .env.example .env          # First time setup
pnpm run setup                # Install dependencies
pnpm run dev                  # Start web + worker together
```

Start individually:

```bash
pnpm run dev:web              # Start Web only (localhost:3000)
pnpm run dev:worker           # Start Worker only
```

### Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | - | PostgreSQL connection string, required |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Redis connection string |
| `REVIEW_QUEUE_NAME` | `review-jobs` | BullMQ queue name |
| `DEFAULT_MODEL_PROVIDER` | - | Default AI provider (anthropic/openai) |
| `DEFAULT_MODEL_NAME` | - | Default model name |

> Webhook signing secrets are repository-scoped: each onboarded repository generates its own secret during onboarding, managed via the Web UI.

## Usage Flow

1. **Register Account** - Visit `http://localhost:3000/register`
2. **Configure AI Provider** - Add Anthropic or OpenAI API Key in settings
3. **Add Repository** - Add code repository to review in repository management
4. **Configure Webhook** - Configure Webhook in Git platform to point to this system
5. **Submit PR** - System automatically triggers review and comments on PR

For detailed usage instructions, please refer to the [User Guide](docs/user-guide.en.md).

## Documentation

- [User Guide](docs/user-guide.en.md) - Detailed usage instructions
- [PR Review Flow](docs/pr-review-flow.md) - Review pipeline technical details
- [Startup and Deployment](doc/startup-and-deployment.md) - Deployment documentation

## Development

```bash
# Install dependencies
pnpm run setup

# Start development environment
pnpm run dev

# Build
pnpm run build

# Run tests
pnpm run test

# Lint
pnpm run lint
```

## License

MIT
