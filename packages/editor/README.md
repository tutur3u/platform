# @tuturuuu/editor

Lightweight localized rich-text editing, Markdown migration, plain-text extraction, and server-safe rendering. Import browser UI from `@tuturuuu/editor/react`; utilities from `@tuturuuu/editor` never load the React editor runtime.

Import `@tuturuuu/editor/styles.css` once in the consuming app to enable the
default compact icon toolbar and localized hover/focus tooltips. Toolbar buttons
retain accessible labels for screen readers.

Both the unchanged legacy preset and the `full` editorial preset expose the
first-level heading. The full preset includes Heading 1 through Heading 4 for
complete document authoring.

## Live WYSIWYG editing

The authoring surface is always a single live WYSIWYG document: headings,
lists, quotes, links, images, collapsible sections, and other prose styling
appear as they will to readers. There is no separate editor, preview, or HTML
source mode.

```tsx
import { RichTextEditor } from "@tuturuuu/editor/react";

<RichTextEditor
  content={content}
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
formatting and paragraphs. When `featurePreset` is omitted, the editor uses the
legacy H1–H3 preset for backward compatibility. The deprecated `enablePreview`,
`enableHTMLSource`, and `onSourceModeDirtyChange` props remain accepted during
migration but do not add another mode or surface.

Use `renderRichTextToHTML(content, { featurePreset, stylePolicy })` on the
server. The renderer escapes text and emits only approved URLs, marks,
alignment, tones, and highlights.
