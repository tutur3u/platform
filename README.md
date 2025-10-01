# Tuturuuu Monorepo

[![Vercel Platform Production Deployment](https://github.com/tutur3u/platform/actions/workflows/vercel-production-platform.yaml/badge.svg)](https://github.com/tutur3u/platform/actions/workflows/vercel-production-platform.yaml)
[![CodeQL](https://github.com/tutur3u/platform/actions/workflows/codeql.yml/badge.svg)](https://github.com/tutur3u/platform/actions/workflows/codeql.yml)
[![Test](https://github.com/tutur3u/platform/actions/workflows/turbo-unit-tests.yaml/badge.svg)](https://github.com/tutur3u/platform/actions/workflows/turbo-unit-tests.yaml)

![Tuturuuu Cover](/public/cover.png)

This monorepo contains the applications and services that make up the Tuturuuu ecosystem. It's a Turborepo-powered monorepo using `bun` for package management. For full documentation, visit [**docs.tuturuuu.com**](https://docs.tuturuuu.com).

## Our Vision: The Intelligent OS for Modern Work

Tuturuuu is building the world's first intelligent, open-source operating system for modern work and life. Our mission is to wage war on digital noise by creating a unified platform that automates administrative work and eliminates the friction of context-switching. We believe technology should be an extension of human will, not a cage for our attention.

Our vision is to create a future where technology unlocks humanity's potential, liberating our collective focus to solve the world's most important challenges. We are entering the **Third Era of technology: the Age of Partners**, where AI acts as an intelligent partner to amplify human potential.

## The Tuturuuu Ecosystem

The platform is a cohesive suite of applications and AI services that behave like a single organism, designed to create a seamless flow state and preserve focus.

### Application Layer: Tools for Flow

-   **Command Center:** A GTD-aligned dashboard that provides a single, glanceable view of your daily tasks, appointments, and reminders.
-   **TuPlan (Smart Calendar):** AI-powered auto-scheduling that allocates time based on deadlines, priorities, and your personal work rhythms.
-   **TuDo (Smart Tasks):** A centralized task hub that captures actions from emails, chats, and meetings, and then schedules them in TuPlan.
-   **TuMeet (Smart Meetings):** An end-to-end meeting solution with collaborative planning, location intelligence, and AI-generated summaries.
-   **TuMail & TuChat (Smart Communications):** An integrated communications hub where AI surfaces commitments and routes them to TuDo and TuPlan.
-   **TuDrive (Unified Storage):** Secure cloud storage woven through tasks, documents, and conversations for effortless knowledge flow.
-   **TuTrack (Mindful Time Tracking):** Lightweight time tracking with Pomodoro rhythms to encourage focused work.

### AI Core: The Architecture of Intelligence

-   **Mira (Soul & Voice):** The empathetic conversational interface that acts as a warm, trustworthy AI partner.
-   **Aurora (Nervous System):** The contextual engine that links related emails, tasks, files, and events, creating our primary data moat.
-   **Rewise (Collective Mind):** An aggregator of leading AI models (Gemini, OpenAI, Anthropic) to ensure Mira always has access to the best knowledge.
-   **Nova (Conscience & Forge):** Our prompt-engineering and alignment platform that shapes how Mira reasons and guarantees safety.
-   **Crystal (Bridge to Humanity):** The multi-modal embodiment of Mira, enabling real-time collaboration via voice, video, and screen sharing.

## Project Structure

-   `apps/web`: The main web application for the Tuturuuu platform, including the Command Center.
-   `apps/docs`: The documentation website, built with Mintlify.
-   `apps/rewise`: An AI-powered chatbot for everyday tasks.
-   `apps/nova`: A prompt engineering platform to learn, practice, and innovate with AI.
-   `packages/`: Shared packages for UI components, AI schemas, Supabase clients, types, and more.

## Prerequisites

-   [Node.js](https://nodejs.org/) (v22+)
-   [bun](https://bun.sh/) (v1.2+)
-   [Docker](https://www.docker.com/) (latest)

## Getting Started

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/tutur3u/platform.git
    cd platform
    ```

2.  **Install dependencies:**
    ```bash
    bun i
    ```

3.  **Start the Supabase local development environment:**
    ```bash
    bun sb:start
    ```

4.  **Set up environment files:**
    Copy `.env.example` to `.env.local` in each app directory and add the Supabase URLs and keys from the previous step.

5.  **Run the development server:**
    ```bash
    bun dev
    ```

## Key Commands

-   `bun dev`: Start all apps in development mode.
-   `bun build`: Build all apps and packages.
-   `bun test`: Run all tests.
-   `bun sb:start`: Start the local Supabase instance.
-   `bun sb:stop`: Stop the local Supabase instance.
-   `bun devx`: Start the full stack with a persisted database.
-   `bun devrs`: Start the full stack with a clean, seeded database.

## Contribution Guidelines

We welcome contributions! Please read our [CONTRIBUTING.md](./CONTRIBUTING.md) file for guidelines on how to submit pull requests, report issues, and suggest improvements. For security vulnerabilities, please follow our [security policy](./SECURITY.md).

## Community & Support

-   Follow us on [X/Twitter](https://x.com/tutur3u) for updates.
-   Join our [GitHub Discussions](https://github.com/orgs/tutur3u/discussions) for support and conversation.

## License

This project is licensed under the Apache License, Version 2.0. See the [LICENSE](./LICENSE) file for more details.
