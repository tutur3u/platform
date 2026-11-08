# Oxlint 1.89.0 and Oxfmt 0.74.0

The root manifest pins Oxlint 1.89.0 and Oxfmt 0.74.0.
The repository wrappers select the supported files and configuration.

## Scoped commands

These commands operate on explicit owned paths:

```sh
bun oxc:format path/to/file.ts
bun oxc:lint path/to/file.ts
bun oxc:write path/to/file.ts
```

The wrapper defines each mode's behavior.
A formatter's unsupported or ignored file is not evidence that the file passed formatting.
Markdown coverage depends on the pinned formatter and repository configuration.

The build-free pre-push entrypoint is `bun check:changed`.
Its selected checks depend on the changed paths and comparison base.
A missing module or failed check is recorded as a failure or refusal, rather than a pass.

Formatting and linting do not replace TypeScript, owning behavioral tests,
app builds, or emitted-Worker acceptance.
A generated file keeps its canonical generator even when a formatter can parse it.

Sources: [Oxfmt](https://oxc.rs/docs/guide/usage/formatter.html),
[Oxlint](https://oxc.rs/docs/guide/usage/linter.html),
[Repository wrapper](../../../scripts/oxc.js),
[Pre-push checks](../../../apps/docs/build/development-tools/pre-push-checks.mdx).
