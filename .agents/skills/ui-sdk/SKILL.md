---
name: ui-sdk
description: Opt-in behavior and accessibility reference for explicitly approved UI SDK pilots. Does not authorize adoption or replacement of existing controls.
---

# UI SDK behavior guidance

Reviewed and abridged copy; see [provenance](README.md). Repository rules and owning Tuturuuu skills govern all implementation and verification.

ui-sdk provides unstyled UI behaviors: keyboard navigation, focus, selection,
dismissal, popups, drag and drop and ARIA. Preserve existing public contracts.

- Name every control with a visible associated label or an accessible name.
- Key lists by value or id, never by index.
- Keep default and controlled values explicit; honor canceled changes.
- Use public component entrypoints; avoid internal imports.
- Check text contrast at 4.5:1 and controls/focus indicators at 3:1.
- Review keyboard, focus, ARIA, server rendering and right-to-left behavior.

Read only the relevant local reference: [interfaces](references/build-interface.md),
[behaviors](references/create-component.md), [patterns](references/patterns.md),
[styles](references/styles.md), [tests](references/testing.md),
[automation boundaries](references/agent-ready.md), or [web components](references/web-components.md).
