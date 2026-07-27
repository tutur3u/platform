# @tuturuuu/editor

Lightweight localized rich-text editing, Markdown migration, plain-text extraction, and server-safe rendering. Import browser UI from `@tuturuuu/editor/react`; utilities from `@tuturuuu/editor` never load the React editor runtime.

Import `@tuturuuu/editor/styles.css` once in the consuming app to enable the
default compact icon toolbar and localized hover/focus tooltips. Toolbar buttons
retain accessible labels for screen readers.

The toolbar exposes separate Heading 1, Heading 2, and Heading 3 controls so
editorial hierarchy is explicit instead of hiding every heading behind one
ambiguous toggle.
