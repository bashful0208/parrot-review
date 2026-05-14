# User Guide

This document provides detailed instructions on how to deploy, configure, and use the Reviewer AI Code Review System.

## Table of Contents

- [Quick Start](#quick-start)
- [System Requirements](#system-requirements)
- [Installation and Deployment](#installation-and-deployment)
- [Configuration](#configuration)
- [Git Platform Integration](#git-platform-integration)
- [Web Dashboard](#web-dashboard)
- [Review Process](#review-process)
- [Docker Deployment](#docker-deployment)
- [FAQ](#faq)

## Quick Start

### 1. Clone the Project

```bash
git clone <repository-url>
cd reviewer
```

### 2. Configure Environment Variables

```bash
cp .env.example .env
```

Edit the `.env` file with at least the following variables:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/reviewer
REDIS_URL=redis://localhost:6379
REVIEW_QUEUE_NAME=review-jobs
DEFAULT_MODEL_PROVIDER=anthropic
DEFAULT_MODEL_NAME=claude-3-7-sonnet
```

### 3. Start Services

**Option 1: Docker Compose (Recommended)**

```bash
docker compose up -d
```

**Option 2: Local Development**

```bash
# Start PostgreSQL and Redis
docker compose -f docker-compose.dev.yml up -d

# Install dependencies and start
pnpm run setup
pnpm run dev
```

### 4. Access the System

- Web Interface: http://localhost:3000
- Register Account: http://localhost:3000/register

## System Requirements

### Required

- **Node.js** >= 22 (LTS recommended)
- **pnpm** >= 9
- **PostgreSQL** >= 16
- **Redis** >= 7

### Optional

- **Docker** and **Docker Compose** (for containerized deployment)

## Installation and Deployment

### Option 1: Docker Compose Full Deployment

This is the simplest deployment method, including all components:

```bash
# Clone the project
git clone <repository-url>
cd reviewer

# Configure environment variables
cp .env.example .env
# Edit the .env file

# Start all services
docker compose up -d
```

After services start:
- Web Interface: http://localhost:3000
- PostgreSQL: localhost:5432
- Redis: localhost:6379

View logs:

```bash
docker compose logs -f web
docker compose logs -f worker
```

Stop services:

```bash
docker compose down
```

### Option 2: Docker Compose Development Environment

Only start base components, run Web and Worker on the host machine:

```bash
# Start PostgreSQL and Redis
docker compose -f docker-compose.dev.yml up -d

# Start applications on host
pnpm run setup
pnpm run dev
```

### Option 3: Full Local Installation

Requires manual installation and configuration of PostgreSQL and Redis:

```bash
# Install dependencies
pnpm run setup

# Start development server
pnpm run dev
```

## Configuration

### Environment Variables Detail

#### Database Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DATABASE_URL` | PostgreSQL connection string | - | Yes |

Connection string format:
```
postgresql://username:password@host:port/database
```

Example:
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/reviewer
```

#### Redis Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `REDIS_URL` | Redis connection string | `redis://127.0.0.1:6379` | No |
| `REVIEW_QUEUE_NAME` | BullMQ queue name | `review-jobs` | No |

Redis connection string format:
```
redis://[:password@]host[:port][/database]
```

Example:
```env
REDIS_URL=redis://:mypassword@redis-host:6379
```

#### AI Model Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DEFAULT_MODEL_PROVIDER` | Default AI provider | - | Yes (for Web startup) |
| `DEFAULT_MODEL_NAME` | Default model name | - | Yes (for Web startup) |

Supported AI providers:
- `anthropic` - Anthropic Claude
- `openai` - OpenAI GPT (compatible with Alibaba Cloud, etc.)

Example:
```env
DEFAULT_MODEL_PROVIDER=anthropic
DEFAULT_MODEL_NAME=claude-3-7-sonnet
```

#### Webhook Configuration

> Note: Webhook signing secrets are now repository-scoped. They are no longer managed via global environment variables. Each repository generates its own Webhook Secret when added, managed through the Web UI.

### Database Initialization

Database migration files are located in the `postgres/migrations/` directory. The system automatically executes migrations on first startup.

Manual migration:

```bash
# Using psql
psql -U postgres -d reviewer -f postgres/migrations/0001_initial.sql
psql -U postgres -d reviewer -f postgres/migrations/0002_comments.sql
# ... execute all migration files sequentially
```

## Git Platform Integration

### GitHub Integration

#### Option 1: GitHub App (Recommended)

1. **Create GitHub App**
   - Go to GitHub Settings > Developer settings > GitHub Apps > New GitHub App
   - Fill in application name and Homepage URL
   - Configure Webhook URL: `https://your-domain.com/api/webhooks/github`
   - Generate Webhook Secret

2. **Configure Permissions**
   - Repository permissions:
     - Pull requests: Read & Write
     - Contents: Read
   - Subscribe to events:
     - Pull request

3. **Install App**
   - Install GitHub App on target repositories
   - Record Installation ID

#### Option 2: Webhook

1. **Go to Repository Settings**
   - Visit repository Settings > Webhooks > Add webhook

2. **Configure Webhook**
   - Payload URL: `https://your-domain.com/api/webhooks/github`
   - Content type: `application/json`
   - Secret: Repository Webhook Secret from Reviewer Web UI
   - Events: Select "Pull requests"

### Gitee Integration

1. **Go to Repository Settings**
   - Visit repository Settings > WebHooks

2. **Configure Webhook**
   - URL: `https://your-domain.com/api/webhooks/gitee`
   - Secret: Repository Webhook Secret from Reviewer Web UI
   - Check "Pull Request" events

### GitLab Integration

1. **Go to Project Settings**
   - Visit project Settings > Webhooks

2. **Configure Webhook**
   - URL: `https://your-domain.com/api/webhooks/gitlab`
   - Secret Token: Repository Webhook Secret from Reviewer Web UI
   - Check "Merge request events"

### Webhook Secret Management

Each repository has its own Webhook Secret, managed through the Web UI:

1. Login to Reviewer Web UI
2. Go to Repository Management page
3. Select target repository
4. Copy Webhook Secret
5. Paste into Git platform's Webhook configuration

## Web Dashboard

### User Registration/Login

1. Visit http://localhost:3000/register to create an account
2. Login with registered email and password

### Repository Management

#### Add Repository

1. Go to "Repositories" page
2. Click "Add Repository"
3. Fill in repository information:
   - Repository name
   - Git platform (GitHub/Gitee/GitLab)
   - Repository URL
   - Access Token (for fetching PR information)
4. Save to get Webhook Secret

#### Repository Configuration

Each repository can be independently configured:
- Webhook Secret (auto-generated)
- Access credentials (encrypted storage)
- Review language preference

### AI Provider Configuration

1. Go to "Settings" > "Providers"
2. Click "Add Provider"
3. Configure Provider information:
   - Name
   - Type (Anthropic/OpenAI)
   - API Key
   - Model name
4. Save configuration

Supported providers:
- **Anthropic**: Claude 3.5 Sonnet, Claude 3 Opus, etc.
- **OpenAI**: GPT-4, GPT-4 Turbo, etc.
- **Compatible Providers**: Alibaba Cloud and other OpenAI-compatible interfaces

### Review History

1. Go to "Review Runs" page
2. View all review records list
3. Click a record to view details:
   - Review status (queued/running/succeeded/failed)
   - Issues found list
   - Review summary
   - Token usage statistics

### Usage Statistics

1. Go to "Usage" page
2. View:
   - Total review count
   - Token consumption
   - Cost statistics
   - Filter by repository/time

## Review Process

### Automatic Review Trigger Conditions

The system automatically triggers reviews when the following events occur:

- **GitHub**: PR opened, synchronize (new commits pushed), reopened
- **Gitee**: PR opened, updated, reopened
- **GitLab**: MR opened, updated, reopened

### Review Process Details

1. **Webhook Reception**
   - Receive PR events from Git platform
   - Verify Webhook signature
   - Normalize event format

2. **Task Queuing**
   - Write review task to Redis queue
   - Deduplicate by deliveryId to prevent duplicate triggers

3. **Worker Processing**
   - Load repository configuration and credentials
   - Fetch PR metadata and diff
   - Load review guidelines (CLAUDE.md, AGENTS.md, etc.)

4. **AI Review**
   - Three reviewers execute in parallel:
     - Quality Reviewer: Code quality review
     - Security Reviewer: Security vulnerability detection
     - Error Handler Reviewer: Error handling review
   - Aggregator deduplicates and sorts
   - Critic reflection loop verification (max 2 rounds)

5. **Result Output**
   - Write to database
   - Post summary comment to PR
   - Post inline comments to specific code lines

### Understanding Review Results

#### Issue Severity Levels

- **Critical**: Serious issues, must be fixed
- **High**: High priority issues, recommend fixing soon
- **Medium**: Moderate issues, recommend fixing
- **Low**: Low priority, optional to fix

#### Issue Types

- **Quality**: Code quality issues (naming, structure, readability, etc.)
- **Security**: Security vulnerabilities (injection, XSS, sensitive data exposure, etc.)
- **Error Handling**: Error handling issues (empty catches, broad exception handling, etc.)

## Docker Deployment

### Full Deployment

```yaml
# docker-compose.yml includes:
# - PostgreSQL 16
# - Redis 7
# - Web application
# - Worker process
```

Start:

```bash
docker compose up -d
```

### Environment Variable Configuration

Create `.env` file:

```env
# Database
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/reviewer

# Redis
REDIS_URL=redis://redis:6379
REVIEW_QUEUE_NAME=review-jobs

# AI Model
DEFAULT_MODEL_PROVIDER=anthropic
DEFAULT_MODEL_NAME=claude-3-7-sonnet

# Optional: Custom ports
WEB_PORT=3000
```

### Production Recommendations

1. **Database**
   - Use external PostgreSQL service
   - Configure regular backups
   - Set up connection pooling

2. **Redis**
   - Use external Redis service
   - Configure persistence
   - Set up password authentication

3. **Web Service**
   - Configure reverse proxy (Nginx/Caddy)
   - Enable HTTPS
   - Configure domain name

4. **Worker Service**
   - Can deploy multiple Worker instances
   - Monitor Worker status
   - Configure log collection

### Docker Compose Production Configuration Example

```yaml
version: '3.8'

services:
  web:
    image: reviewer-web:latest
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://user:pass@external-db:5432/reviewer
      - REDIS_URL=redis://:pass@external-redis:6379
      - DEFAULT_MODEL_PROVIDER=anthropic
      - DEFAULT_MODEL_NAME=claude-3-7-sonnet
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  worker:
    image: reviewer-worker:latest
    environment:
      - DATABASE_URL=postgresql://user:pass@external-db:5432/reviewer
      - REDIS_URL=redis://:pass@external-redis:6379
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=reviewer
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass yourpassword
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

## FAQ

### Q: Worker fails to start, showing Redis connection error

**A:** Check the following:

1. Is Redis running?
2. Is `REDIS_URL` configured correctly?
3. Is the Redis password correct?
4. Is the network accessible?

```bash
# Test Redis connection
redis-cli -h localhost -p 6379 ping
```

### Q: Webhook triggered but no review results

**A:** Check the following:

1. Is Worker running normally?
2. Is Webhook Secret configured correctly?
3. Is AI Provider configured correctly?
4. Check Worker logs for detailed error information

```bash
# View Worker logs
docker compose logs -f worker
```

### Q: Review results not posted as comments on PR

**A:** Check the following:

1. Does the Git platform access token have comment permissions?
2. Is the Webhook configured with correct event types?
3. Check review record status and error messages

### Q: How to change the AI model?

**A:** Two methods:

1. **Change default model**: Update environment variables `DEFAULT_MODEL_PROVIDER` and `DEFAULT_MODEL_NAME`
2. **Change repository model**: Configure in repository settings in Web UI

### Q: How to view review costs?

**A:** Go to the "Usage" page in Web UI to view:
- Total token consumption
- Statistics by repository
- Statistics by time
- Cost estimation

### Q: Which programming languages are supported?

**A:** Theoretically supports all programming languages, as reviews are based on AI model semantic understanding. Actual effectiveness depends on:
- AI model's training data for specific languages
- Code complexity and context

### Q: How to customize review rules?

**A:** Add the following files to the target repository:

- `CLAUDE.md`: General coding standards
- `AGENTS.md`: Agent behavior rules
- `pattern.md`: Code patterns and best practices

The system will automatically load these files as review guidelines during review.

### Q: How to clean up review records?

**A:** Currently requires manual database cleanup:

```sql
-- Clean up review records older than 30 days
DELETE FROM review_runs WHERE created_at < NOW() - INTERVAL '30 days';
DELETE FROM review_issues WHERE created_at < NOW() - INTERVAL '30 days';
```

> Recommend backing up the database before cleanup.

### Q: How to scale Worker concurrency?

**A:** Two methods:

1. **Increase single Worker concurrency**: Modify the `concurrency` parameter in `apps/worker/src/index.ts`
2. **Deploy multiple Worker instances**: Use Docker Compose scale

```bash
docker compose up -d --scale worker=3
```

## Getting Help

- View logs: `docker compose logs -f`
- Submit Issues: [GitHub Issues]
- View documentation: `doc/` directory
