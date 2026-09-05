---
name: improve-codebase-architecture
description: "Assess module boundaries and propose focused refactors for a requested architecture review."
---

# Architecture Review

Assess the requested area for unnecessary coupling, leaky interfaces, and fragmented
responsibilities. Use the project's domain vocabulary and relevant ADRs when present.
An interface earns its complexity when it hides meaningful implementation detail.
Test a proposed extraction by asking whether it concentrates complexity or merely
moves it into more files.

Report concrete candidates with paths, observed friction, proposed boundaries,
tradeoffs, and behavior-level validation. Distinguish evidence from speculation.
Use a diagram when it clarifies dependency structure; HTML is optional unless requested.
For terminology see [LANGUAGE.md](LANGUAGE.md), and for a detailed interface exercise
see [INTERFACE-DESIGN.md](INTERFACE-DESIGN.md). Read only the relevant reference.

For a review-only request, finish with recommendations. If implementation is also
authorized, continue through the selected or clearly implied scope, validation, and
requested delivery. Ask only when choosing among candidates would materially change
the assignment. Do not add glossary files or ADRs merely because the skill mentions them.
