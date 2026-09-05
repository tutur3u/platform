# Tambo Bootstrap Commands

Use the parts relevant to the selected framework. Commands run from the project directory.

### Step 2: Execute Everything (No Stopping)

Complete the authorized setup and validation. Diagnose and fix recoverable failures within scope; ask only when a missing decision or access blocks progress.

All templates (`standard`, `vite`, `analytics`) come with chat UI, TamboProvider wiring, component registry, and starter components already included. You do NOT need to add chat UI or wire up the app — just scaffold, configure the API key, add custom components, and start the server.

#### 2a. Scaffold the project

For Next.js (recommended):

```bash
npx tambo create-app <app-name> --template=standard --skip-tambo-init
cd <app-name>
```

For Vite:

```bash
npx tambo create-app <app-name> --template=vite --skip-tambo-init
cd <app-name>
```

Use `--skip-tambo-init` since `create-app` normally tries to run `tambo init` interactively, which won't work in non-interactive environments like coding agents. We handle the API key in the next step.

#### 2b. Set up API key

If the user provided a key:

```bash
npx tambo init --api-key=<USER_PROVIDED_KEY>
```

This writes the key to the correct `.env` file with the framework-appropriate variable name (`NEXT_PUBLIC_TAMBO_API_KEY`, `VITE_TAMBO_API_KEY`, etc.).

If the user skipped, tell them once at the end to run `npx tambo init` when ready. Don't nag about it during setup.

**IMPORTANT:** Do NOT hardcode `--api-key=sk_...` in commands you run. The `--api-key` flag should only be used with an actual key the user has provided.

#### 2c. Create custom starter components

The template includes basic components, but add 1-2 components tailored to what the user wants to build. Don't use generic examples:

- **Dashboard app** → `StatsCard`, `DataTable`
- **Chatbot** → `BotResponse` with markdown support
- **Data visualization** → `Chart` with configurable data
- **Task manager** → `TaskCard`, `TaskBoard`
- **Generic / unclear** → `ContentCard`

Each component needs:

1. A Zod schema with `.describe()` on every field
2. The React component itself
3. Registration in the existing component registry (`lib/tambo.ts` — add to the existing `components` array, don't replace it)

**Schema constraints — Tambo will reject invalid schemas at runtime:**

- **No `z.record()`** — Record types (objects with dynamic keys) are not supported anywhere in the schema, including nested inside arrays or objects. Use `z.object()` with explicit named keys instead.
- **No `z.map()` or `z.set()`** — Use arrays and objects instead.
- For tabular data like rows, use `z.array(z.object({ col1: z.string(), col2: z.number() }))` with explicit column keys — NOT `z.array(z.record(z.string(), z.unknown()))`.

**React best practices for generated components:**

- Always add unique `key` props when rendering lists (`.map()`). Use a unique field from the data (like `id`) — not the array index.
- Include an `id` field (e.g., `z.string().describe("Unique identifier")`) in schemas for array items so there's always a stable key available.

Example:

```tsx
// src/components/StatsCard.tsx
import { z } from "zod/v4";

export const StatsCardSchema = z.object({
  title: z.string().describe("Metric name"),
  value: z.number().describe("Current value"),
  change: z.number().optional().describe("Percent change from previous period"),
  trend: z.enum(["up", "down", "flat"]).optional().describe("Trend direction"),
});

type StatsCardProps = z.infer<typeof StatsCardSchema>;

export function StatsCard({
  title,
  value,
  change,
  trend = "flat",
}: StatsCardProps) {
  // ... implementation with Tailwind styling
}
```

Then add to the existing registry in `lib/tambo.ts`:

```tsx
// Add to the existing components array — don't replace what's already there
// Next.js: import { StatsCard, StatsCardSchema } from "@/components/StatsCard";
// Vite: import { StatsCard, StatsCardSchema } from "../components/StatsCard";
import { StatsCard, StatsCardSchema } from "@/components/StatsCard";

// ... existing components ...
{
  name: "StatsCard",
  component: StatsCard,
  description: "Displays a metric with value and trend. Use when user asks about stats, metrics, or KPIs.",
  propsSchema: StatsCardSchema,
},
```

#### 2d. Start the dev server

Only start the dev server after all code changes (scaffolding, init, component creation, registry updates) are complete.

```bash
npm run dev
```

Run this in the background so the user can see their app immediately.

### Step 3: Summary

After everything is running, give a brief summary:

- What was set up
- What components were created and what they do
- The URL where the app is running (typically `http://localhost:3000` for Next.js, `http://localhost:5173` for Vite)
- If they skipped the API key: remind them once to run `npx tambo init` to set it up
- A suggestion for what to try first (e.g., "Try asking it to show you a stats card for monthly revenue")

## Technology Stacks Reference

### Recommended Stack (Default)

```
Next.js 14+ (App Router)
├── TypeScript
├── Tailwind CSS
├── Zod (for schemas)
└── @tambo-ai/react
```

```bash
npx tambo create-app my-app --template=standard
```

### Vite Stack

```
Vite + React
├── TypeScript
├── Tailwind CSS
├── Zod
└── @tambo-ai/react
```

### Minimal Stack (No Tailwind)

```
Vite + React
├── TypeScript
├── Plain CSS
├── Zod
└── @tambo-ai/react
```

## Component Registry Pattern

Every generative component must be registered:

```tsx
import { TamboComponent } from "@tambo-ai/react";
import { ComponentName, ComponentNameSchema } from "@/components/ComponentName";

export const components: TamboComponent[] = [
  {
    name: "ComponentName",
    component: ComponentName,
    description: "What it does. When to use it.",
    propsSchema: ComponentNameSchema,
  },
];
```

Key rules:

- **propsSchema**: Zod object with `.describe()` on every field — this is how the AI knows what to pass
- **description**: Tell the AI when to use this component — be specific about trigger phrases
- **Streaming**: Props arrive incrementally, so handle undefined gracefully (optional fields or defaults)

## Adding More Chat UI (Optional)

Templates already include chat UI. These are only needed if the user wants additional UI primitives beyond what the template provides:

```bash
npx tambo add message-thread-full --yes    # Complete chat interface
npx tambo add control-bar --yes            # Controls and actions
npx tambo add canvas-space --yes           # Rendered component display area
npx tambo add thread-history --yes         # Conversation history sidebar
```

## Supported Technologies

| Technology       | Support Level | Notes                             |
| ---------------- | ------------- | --------------------------------- |
| Next.js 14+      | Full          | Recommended, App Router preferred |
| Vite             | Full          | Great for SPAs                    |
| Create React App | Partial       | Works but CRA is deprecated       |
| Remix            | Partial       | Works with client components      |
| TypeScript       | Full          | Strongly recommended              |
| JavaScript       | Full          | Works but less type safety        |
| Tailwind CSS     | Full          | Default for CLI components        |
| Plain CSS        | Full          | Need custom component styling     |
| CSS Modules      | Full          | Supported                         |
| Zod              | Required      | Used for all schemas              |

## Reporting Bugs & Feedback

If you encounter any of these while helping a user, suggest filing a GitHub issue:

- A bug in `@tambo-ai/react`, `@tambo-ai/client`, or the `tambo` CLI
- Documentation that contradicts actual behavior
- Missing or misleading instructions in this skill

### Issue Template

Use this template when drafting an issue for `tambo-ai/tambo`:

````markdown
**Title:** [Short description of the problem]

**Expected behavior**
What should happen.

**Actual behavior**
What happens instead, including any error messages or stack traces.

**Repro steps**

1. Run `npx tambo create-app ...` (or whatever command)
2. Add this code:

```tsx
// minimal code that reproduces the issue
```

3. Observe the error

**Environment**

- `@tambo-ai/react` version:
- `@tambo-ai/client` version:
- Framework (Next.js / Vite / CRA) and version:
- Node.js version:
- OS:

**Additional context**
Link to relevant docs or skill file path if applicable.
````

**Security:** Redact API keys, tokens, and any customer data before including logs or code snippets in the issue.

### Suggesting an Issue to the User

When you hit a problem that looks like a Tambo bug, say something like:

> This looks like a bug in `@tambo-ai/react`. Want me to open a GitHub issue on `tambo-ai/tambo` with the repro steps and environment details?

Always wait for the user to confirm before filing.
