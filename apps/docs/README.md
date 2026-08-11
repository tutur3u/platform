# Tuturuuu Documentation

The documentation workspace is now organized around the lifecycle of building with Tuturuuu—understand the vision, explore the platform, build confidently, learn continuously, and reference stable contracts.

## 📁 Directory Structure

```text
apps/docs/
├── overview/                # Vision, mission, company playbooks
│   ├── vision.mdx
│   ├── organization-guide.mdx
│   └── agent-operating-manual.mdx
├── platform/                # Product experience, AI, components, personalization
│   ├── index.mdx
│   ├── ai/structured-data.mdx
│   ├── features/
│   │   ├── command-center-dashboard.mdx
│   │   ├── meet-together.mdx
│   │   └── user-management.mdx
│   ├── components/
│   │   ├── index.mdx
│   │   ├── workspace-wrapper.mdx
│   │   └── workspace-wrapper-quick-reference.mdx
│   └── personalization/
│       ├── themes.mdx
│       └── language.mdx
├── build/                   # Development tooling and workflows
│   ├── index.mdx
│   └── development-tools/
│       ├── index.mdx
│       ├── development.mdx
│       ├── monorepo-architecture.mdx
│       ├── git-conventions.mdx
│       ├── local-supabase-development.mdx
│       ├── ci-cd-pipelines.mdx
│       ├── cleaning-clone.mdx
│       └── documenting.mdx
├── learn/                   # Examples, experiments, prompt engineering
│   ├── index.mdx
│   ├── examples/index.mdx
│   ├── experiments/
│   │   ├── form-builder.mdx
│   │   ├── calendar.mdx
│   │   ├── finance.mdx
│   │   ├── project-management.mdx
│   │   └── ai-chat.mdx
│   └── prompt-engineering/
│       ├── introduction.mdx
│       └── prompt-design-strategies/
└── reference/               # API contracts and schemas
    ├── index.mdx
    └── api-reference/endpoint/generate.mdx
```

Static assets (images, favicon, logos) live alongside `docs.json` at the root of `apps/docs/`.

## 🧭 Organization Principles

1. **Lifecycle-Oriented** – Content flows from vision → platform → build → learn → reference.
2. **Single Source of Truth** – Each topic lives in exactly one place, with cross-links instead of duplicates.
3. **Absolute Links** – Use absolute paths (e.g., `/platform/overview`) to keep navigation resilient to future moves.
4. **Mermaid 10.8.0** – All diagrams conform to Mermaid 10.8.0 syntax for consistent rendering.

## ✍️ Authoring Guidelines

### Front Matter Template

```mdx
---
title: 'Page Title'
description: 'Short purpose statement.'
updated: 'YYYY-MM-DD'
---
```

- Use `updated` when making meaningful edits.
- Keep titles sentence case; avoid title case unless it is a proper noun.

### Content Checklist

- Provide context before diving into steps.
- Include diagrams when they clarify complex relationships.
- Cross-link related docs using absolute paths.
- Close with “Next steps” or related resources where helpful.

## 🔧 Maintaining Navigation

All sidebar navigation lives in `apps/docs/docs.json`. When adding a page:

1. Place the file in the correct directory.
2. Add the path to the appropriate `navigation` group in `docs.json`.
3. Cross-link the page from the relevant overview page when it helps readers discover related content.
4. Run `bun dev:docs` from the repo root to verify links render correctly.

## 🚀 Quick Start for Contributors

1. Review the [Build & Ship](/build/overview) section for environment setup and workflows.
2. Read the [Documentation Organization Guide](/overview/organization-guide) to understand how we structure content.
3. When documenting a product area, reference the [Platform Overview](/platform/overview) for framing and terminology.

## 🤝 Contributing Tips

- Favor smaller, focused PRs that touch a single section.
- Include screenshots or diagrams when introducing new UI/UX flows.
- Update `updated` timestamps so readers can track freshness.
- If a change impacts multiple sections, coordinate with docs maintainers before merging.

## 📚 Useful Resources

- [Mintlify Documentation](https://mintlify.com/docs)
- [MDX Guide](https://mdxjs.com/)
- [Mermaid Syntax Reference](https://mermaid.js.org/intro/syntax-reference.html)

Thanks for helping us keep the Tuturuuu knowledge base world-class.
