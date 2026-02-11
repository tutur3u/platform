# Tuturuuu Monorepo

[![Vercel Platform Production Deployment](https://github.com/tutur3u/platform/actions/workflows/vercel-production-platform.yaml/badge.svg)](https://github.com/tutur3u/platform/actions/workflows/vercel-production-platform.yaml)
[![CodeQL](https://github.com/tutur3u/platform/actions/workflows/codeql.yml/badge.svg)](https://github.com/tutur3u/platform/actions/workflows/codeql.yml)
[![Test](https://github.com/tutur3u/platform/actions/workflows/turbo-unit-tests.yaml/badge.svg)](https://github.com/tutur3u/platform/actions/workflows/turbo-unit-tests.yaml)

![Tuturuuu Cover](/public/cover.png)

A Turborepo-powered monorepo containing the applications and services that make up the Tuturuuu ecosystem. For full documentation, visit [**docs.tuturuuu.com**](https://docs.tuturuuu.com).

---

## Our Vision

Tuturuuu is building the world's first **intelligent, open-source operating system for modern work and life**. We wage war on digital noise by creating a unified platform that automates administrative work and eliminates the friction of context-switching.

We believe we are entering the **Third Era of technology: the Age of Partners** - where AI acts as an intelligent partner to amplify human potential, not a cage for our attention.

> *Read the full vision at [docs.tuturuuu.com/overview/vision](https://docs.tuturuuu.com/overview/vision)*

---

## Platform Applications

### Core Platform

| App | Port | Description |
|-----|------|-------------|
| **web** | 7803 | Main platform with workspace management, AI integration, finance, inventory, and task management |
| **calendar** | 3001 | Smart calendar with Google Calendar sync and AI-powered scheduling |
| **finance** | 7808 | Finance management, wallet tracking, and budgeting |
| **tasks** | 7809 | Hierarchical task management (Workspaces > Initiatives > Projects > Boards > Tasks) |

### AI & Learning

| App | Port | Description |
|-----|------|-------------|
| **nova** | 7805 | Prompt engineering platform to learn, practice, and compete with AI challenges |
| **rewise** | 7804 | AI-powered chatbot with voice support and multi-model integration |

### Collaboration

| App | Port | Description |
|-----|------|-------------|
| **meet** | 7807 | Meeting management with AI transcription and summaries |
| **shortener** | 3002 | URL shortener service with analytics |

### Infrastructure & Utilities

| App | Port | Description |
|-----|------|-------------|
| **docs** | - | Documentation website built with Mintlify |
| **db** | - | Supabase database configuration, migrations, and type generation |
| **external** | 3000 | SDK demonstration app showing secure integration patterns |
| **playground** | 3003 | Development sandbox for experimentation |

### Non-JavaScript Applications

| App | Runtime | Description |
|-----|---------|-------------|
| **discord** | Python/Modal | Discord bot with API info, URL shortening, and daily reports |
| **backend** | Rust/Axum | Educational Rust backend with REST APIs and WebSocket support |

---

## Shared Packages

### Core

| Package | Description |
|---------|-------------|
| **@tuturuuu/ui** | Shared UI components and design system (Shadcn/Radix) |
| **@tuturuuu/types** | Common TypeScript types and generated Supabase types |
| **@tuturuuu/icons** | Icon wrapper for lucide-react with Tuturuuu branding |
| **@tuturuuu/utils** | Shared utilities: dates, colors, permissions, feature flags |

### Data & Authentication

| Package | Description |
|---------|-------------|
| **@tuturuuu/supabase** | Supabase client with SSR support for Next.js |
| **@tuturuuu/auth** | Authentication utilities and multi-session support |
| **@tuturuuu/apis** | API clients for platform integrations |

### AI & Integrations

| Package | Description |
|---------|-------------|
| **@tuturuuu/ai** | Multi-provider AI integration (OpenAI, Anthropic, Google, 20+ providers) |
| **@tuturuuu/google** | Google API integrations (Calendar, Analytics) |
| **@tuturuuu/vercel** | Vercel Analytics and Speed Insights |
| **@tuturuuu/trigger** | Trigger.dev background jobs and calendar sync |

### Payments & Communication

| Package | Description |
|---------|-------------|
| **@tuturuuu/payment** | Payment processing (Polar.sh, Dodo Payments) |
| **@tuturuuu/transactional** | Transactional email templates with React Email |

### Specialized

| Package | Description |
|---------|-------------|
| **@tuturuuu/masonry** | High-performance Pinterest-style masonry grid |
| **@tuturuuu/games** | Game mechanics for platform gamification |
| **@tuturuuu/workflows** | Workflow automation SDK |

### Public SDK

| Package | Description |
|---------|-------------|
| **tuturuuu** | Official TypeScript SDK for the Tuturuuu API (storage, documents, analytics) |

---

## Future Roadmap: AI Architecture

Our vision for an integrated AI ecosystem:

- **Mira** - The empathetic conversational interface acting as a warm, trustworthy AI partner
- **Aurora** - The contextual engine linking emails, tasks, files, and events
- **Rewise** - An aggregator of leading AI models *(partially implemented)*
- **Nova** - Prompt-engineering and alignment platform *(implemented)*
- **Crystal** - Multi-modal embodiment enabling real-time voice, video, and screen collaboration

---

## Tech Stack

| Category | Technologies |
|----------|-------------|
| **Runtime** | Node.js v22+, Bun v1.3+ |
| **Framework** | Next.js 16 with App Router and Turbopack |
| **Database** | Supabase (PostgreSQL) with RLS |
| **Styling** | Tailwind CSS v4.1+ |
| **State** | Jotai, TanStack Query |
| **API** | tRPC, Vercel AI SDK |
| **Testing** | Vitest |
| **Monorepo** | Turborepo |

---

## Prerequisites

- [Node.js](https://nodejs.org/) v22+
- [Bun](https://bun.sh/) v1.3+
- [Docker](https://www.docker.com/) (for local Supabase)

---

## Getting Started

```bash
# 1. Clone the repository
git clone https://github.com/tutur3u/platform.git
cd platform

# 2. Install dependencies
bun i

# 3. Start Supabase (requires Docker)
bun sb:start

# 4. Set up environment files
# Copy .env.example to .env.local in each app directory
# Add Supabase URLs and keys from the sb:start output

# 5. Run the development server
bun dev
```

---

## Key Commands

### Development

| Command | Description |
|---------|-------------|
| `bun dev` | Start all apps in development mode |
| `bun dev:web` | Start main web app only |
| `bun devx` | Start full stack with persisted database |
| `bun devrs` | Start full stack with clean, seeded database |

### Database

| Command | Description |
|---------|-------------|
| `bun sb:start` | Start local Supabase (Studio at :8003, InBucket at :8004) |
| `bun sb:stop` | Stop local Supabase |
| `bun sb:new` | Create new migration |
| `bun sb:up` | Apply migrations locally |
| `bun sb:reset` | Reset database to seed state |
| `bun sb:typegen` | Generate TypeScript types from schema |

### Build & Test

| Command | Description |
|---------|-------------|
| `bun build` | Build all apps and packages |
| `bun test` | Run all tests |
| `bun lint` | Check linting |
| `bun format` | Check formatting |

For a complete list of commands, see the [Development Guide](https://docs.tuturuuu.com/build/development-tools/development).

---

## Documentation

### For Developers

- [Platform Architecture](https://docs.tuturuuu.com/platform/architecture/routing) - System design, tRPC, authentication
- [Database Reference](https://docs.tuturuuu.com/reference/database/schema-overview) - Schema and RLS policies
- [Package Reference](https://docs.tuturuuu.com/reference/packages/supabase) - API documentation
- [Development Tools](https://docs.tuturuuu.com/build/development-tools) - Monorepo setup, Supabase workflows

### For AI Agents

- [Agent Operating Manual](https://docs.tuturuuu.com/overview/agent-operating-manual) - Guidelines for AI assistants
- [CLAUDE.md](./CLAUDE.md) - Detailed operational instructions

---

## Contributing

We welcome contributions! Please read our [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on submitting pull requests, reporting issues, and suggesting improvements.

For security vulnerabilities, please follow our [security policy](./SECURITY.md).

---

## Community & Support

- Follow us on [X/Twitter](https://x.com/tutur3u) for updates
- Join our [GitHub Discussions](https://github.com/orgs/tutur3u/discussions) for support

---

## License

This project is licensed under the Apache License, Version 2.0. See the [LICENSE](./LICENSE) file for details.
