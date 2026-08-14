# @tuturuuu/editor

Lightweight localized rich-text editing, Markdown migration, plain-text extraction, and server-safe rendering. Import browser UI from `@tuturuuu/editor/react`; utilities from `@tuturuuu/editor` never load the React editor runtime.

Import `@tuturuuu/editor/styles.css` once in the consuming app to enable the
default compact icon toolbar and localized hover/focus tooltips. Toolbar buttons
retain accessible labels for screen readers.

Both the unchanged legacy preset and the `full` editorial preset expose the
first-level heading. The full preset includes Heading 1 through Heading 4 for
complete document authoring.

## Live WYSIWYG editing and safe HTML source

The authoring surface is always a live WYSIWYG document: headings, lists,
quotes, links, images, and other prose styling appear as they will to readers.
Consumers can optionally expose safe HTML source while continuing to store
structured JSON:

```tsx
import { RichTextEditor } from "@tuturuuu/editor/react";

<RichTextEditor
  content={content}
  enableHTMLSource
  featurePreset="full"
  locale="en"
  onChange={setContent}
  stylePolicy={{
    alignments: ["left", "center", "right"],
    textTones: [{ label: "Brand gold", value: "var(--brand-gold)" }],
    highlights: [{ label: "Warm highlight", value: "var(--brand-highlight)" }],
  }}
/>;
```

`full` includes H1–H4, lists, quotes, dividers, and images. `compact` disables
headings and block content, keeping narrative fields focused on inline
formatting and paragraphs. When `featurePreset` is omitted it defaults to
`full` if `enableHTMLSource` is set, and to the legacy H1–H3 preset otherwise.
The legacy Editor/Preview switch has been retired because editing itself now
shows the formatted document. The deprecated `enablePreview` prop is accepted
for compatibility but no longer adds a separate mode. Source mode rejects
executable markup, unsafe URLs, custom classes, and arbitrary CSS; it
normalizes harmless unsupported markup before applying it to the canonical JSON.
`onSourceModeDirtyChange` lets a host include unapplied source in its
unsaved-navigation protection.

Use `renderRichTextToHTML(content, { featurePreset, stylePolicy })` on the
server. The renderer escapes text and emits only approved URLs, marks,
alignment, tones, and highlights.
