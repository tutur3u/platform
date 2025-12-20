# Technology Stack

## 1. Core Architecture
*   **Monorepo:** Turborepo
*   **Package Manager:** bun
*   **Version Control:** Git

## 2. Frontend & Web Applications
*   **Framework:** Next.js (App Router, Turbopack)
*   **Language:** TypeScript
*   **Styling:** Tailwind CSS (v4), PostCSS
*   **UI Libraries:**
    *   shadcn-ui (Radix UI primitives)
    *   Mantine (specialized components)
    *   Framer Motion (animations)
*   **State Management:**
    *   Server State: TanStack Query (React Query)
    *   Global Client State: Jotai, Zustand

## 3. Backend & Infrastructure
*   **Primary Backend (BaaS):** Supabase
    *   **Database:** PostgreSQL
    *   **Auth:** Supabase Auth (GoTrue)
    *   **Storage:** Supabase Storage
    *   **Realtime:** Supabase Realtime
*   **Microservices:**
    *   **Rust Service (`apps/backend`):** Rust, Axum (REST/WebSockets)
    *   **Python Service (`apps/discord`):** Python, Modal (Serverless GPU/Job execution)
*   **Edge Functions:** Vercel Edge / Supabase Edge Functions

## 4. AI & Data Engineering
*   **SDK:** Vercel AI SDK
*   **Model Providers:** OpenAI, Anthropic, Google Gemini (Multi-provider)
*   **Orchestration:** LangChain (implied/potential usage in Python services)

## 5. Development & Quality Assurance
*   **Testing:** Vitest, Playwright (implied for E2E)
*   **Linting & Formatting:** Biome
*   **Type Checking:** TypeScript, `tsgo` (native speedup)
*   **Documentation:** Mintlify (`apps/docs`)

## 6. Hosting & CI/CD
*   **Web:** Vercel
*   **Database:** Supabase Cloud
*   **Python/AI:** Modal
*   **CI/CD:** GitHub Actions
