---
name: generative-ui
description: "Create a new Tambo generative UI app when Tambo is the chosen framework."
---

# Tambo Generative UI

Create a new Tambo app only when that framework is selected by the user or project.
Infer app name and framework from context; ask only for missing material choices.
Use the user's environment for required keys and report missing live credentials
without blocking local scaffolding. Do not request secrets in chat.

- `references/bootstrap.md`: starter commands and framework-specific setup.
- `references/components.md`: component registration and schemas.
- `references/component-rendering.md`: rendering lifecycle.
- `references/threads.md`: conversation state.
- `references/tools-and-context.md`: tool and context integration.
- `references/cli.md`: CLI operation.

Read only the relevant guide. Complete the requested implementation, verify the
actual interactions, and fix recoverable failures. Start a server when runtime
verification is authorized; report any access or deployment boundary still pending.
