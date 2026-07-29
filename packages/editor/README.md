# @tuturuuu/editor

Lightweight localized rich-text editing, Markdown migration, plain-text extraction, and server-safe rendering. Import browser UI from `@tuturuuu/editor/react`; utilities from `@tuturuuu/editor` never load the React editor runtime.

Import `@tuturuuu/editor/styles.css` once in the consuming app to enable the
default compact icon toolbar and localized hover/focus tooltips. Toolbar buttons
retain accessible labels for screen readers.

The unchanged legacy preset exposes separate Heading 1, Heading 2, and Heading
3 controls. The opt-in `full` editorial preset uses the visitor-facing H2–H4
hierarchy instead, so a field cannot accidentally create a second page title.

## Safe Editor/HTML source and Preview modes

Consumers can opt into safe HTML and read-only preview modes while continuing
to store structured JSON:

```tsx
import { RichTextEditor } from '@tuturuuu/editor/react';

<RichTextEditor
  content={content}
  enableHTMLSource
  enablePreview
  featurePreset="full"
  locale="en"
  onChange={setContent}
  stylePolicy={{
    alignments: ['left', 'center', 'right'],
    textTones: [{ label: 'Brand gold', value: 'var(--brand-gold)' }],
    highlights: [
      { label: 'Warm highlight', value: 'var(--brand-highlight)' },
    ],
  }}
/>;
```

`full` includes H2–H4, lists, quotes, dividers, and images. `compact` disables
headings and block content, keeping narrative fields focused on inline
formatting and paragraphs. When `featurePreset` is omitted it defaults to
`full` if `enableHTMLSource` is set, and to the legacy H1–H3 preset otherwise.
Preview renders the current structured document without formatting controls or
mutating the value. Source mode
rejects executable markup, unsafe URLs, custom classes, and arbitrary CSS; it
normalizes harmless unsupported markup before applying it to the canonical JSON.
`onSourceModeDirtyChange` lets a host include unapplied source in its
unsaved-navigation protection.

Use `renderRichTextToHTML(content, { featurePreset, stylePolicy })` on the
server. The renderer escapes text and emits only approved URLs, marks,
alignment, tones, and highlights.
