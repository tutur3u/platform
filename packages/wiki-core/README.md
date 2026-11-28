# Wiki core

`@tuturuuu/wiki-core` provides the Wiki document schema, shared-origin HTML renderer, Markdown codec, publication scan and API payload schemas. The Lettin subpath keeps its existing validation and media URL rules.

## Markdown and MDX

Use `parseWikiMarkdown(source, { format: 'mdx', resolveLink, resolveAsset })` for Mintlify imports. The caller supplies a link resolver backed by the page and redirect inventory and an asset resolver backed by the workspace asset inventory. Relative Markdown links and legacy docs links need a resolver. Canonical Wiki links pass through for the caller to check against its inventory. Unmapped links and assets raise a line-numbered error.

| Source | Wiki representation |
| --- | --- |
| Frontmatter | Separate metadata mapping. Publication visibility is decided by the server. |
| Headings, lists, task lists, tables and inline formatting | Structured document nodes with GitHub-style heading IDs. `:anchor{#id}` preserves explicit heading IDs in exports. |
| `Info`, `Note`, `Warning`, `Tip`, `Check` | Callouts using `> [!TONE]`. |
| `Card`, `CardGroup` | Standalone cards and grids using fenced `cards` YAML. |
| `Accordion`, `AccordionGroup` | Details blocks. Authors can use `:::details Title`; exports use the quoted directive attribute. |
| `Steps`, `Step` | Ordered lists with bold titles. |
| `CodeGroup`, code-only `Tabs` and `Tab` | Fenced code with titles. Mermaid stays literal code. |
| `ParamField`, `ResponseField`, `Endpoint` | Tables and endpoint code. Tables with rich cells or spans use fenced `wiki-table` YAML. |
| Markdown images, `img`, `Frame` | Content-addressed Wiki assets and optional caption paragraphs. |
| Static `div`, `span`, `br`, and empty `a id` | Block or inline content, hard breaks, and namespaced anchors. Layout classes stay out of the document. |
| `Counter`, `LoginToggle`, `TailwindPlayground`, `MiniTaskManager`, `LiveCard` and module declarations | Literal source and a callout when a reviewed file explicitly enables `staticDemos`. |

MDX comments are omitted from the rendered document. Unknown components, interactive expressions, component spreads, arbitrary HTML, rich tab bodies and unsupported Markdown constructs fail conversion. The exporter verifies the round trip and raises an error when source JSON cannot be represented losslessly. Examples in `src/fixtures` come from the Smart Scheduling overview and API reference, the Masonry reference, and the AI SDK workshop.

## Rendering and publication

- `renderWikiHtml` validates the body before producing HTML. Its fixed `wiki-heading-` ID prefix keeps user-defined anchors away from common names in the shared document. Wiki fragment links receive the same prefix. A redirect or reader compatibility layer must translate legacy bare fragments.
- Images reference only `/wiki/<space>/_assets/<sha256>`. The asset handler owns access checks, MIME verification and SVG isolation.
- `scanPublicSafety` takes the saved body, a trusted map of canonical Wiki paths to visibility, and revision title and description. Resolve redirects against their final public destinations when populating the map. Unknown or non-public destinations and links into `build/` block publication. Rescan when publishing and bind the result and rule version to the exact revision.
- `hashWikiBody` validates and normalizes the document, then hashes UTF-8 JSON with sorted object keys. Persist the validated body and use the same canonical bytes for revision comparisons.
- API schemas validate payloads. Route handlers derive the write source from trusted request context. Asset upload fields accept image hints, and the persisted asset record uses file properties measured by the server. Route handlers also own request byte caps, authentication, authorization, idempotency, quotas, scope checks and publish receipts.
