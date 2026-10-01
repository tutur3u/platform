# Learn and Teach satellite design

Learn and Teach use the Tuturuuu platform design language. Authenticated workspaces render through each app's `[wsId]/structure.tsx` and the shared `SidebarStructure`: Tuturuuu brand, app launcher, workspace selector, navigation, global settings, notifications, and account menu. Keep their app-specific actions compact and aligned with that sidebar. Their navigation routes and active aliases live in `navigation.tsx`.

## Surfaces and hierarchy

- Use the shared theme tokens (`bg-root-background`, `bg-background`, `bg-card`, `bg-muted`, `text-foreground`, `text-muted-foreground`, `border-border`) so light, dark, and system themes behave like apps/web.
- Main panels use a subtle one-pixel border and rounded corners. Inner controls use a smaller radius. Avoid thick borders, offset shadows, decorative stamps, and square controls.
- Use a restrained type scale: a clear page heading, section headings, regular body copy, and medium-weight controls. Prefer sentence case and short, product-focused text. Metrics use tabular numerals.
- Keep one primary action per section; secondary actions use quiet or outline styles. Include visible hover and keyboard focus states.
- Keep content in a responsive max-width container. Dashboards should show useful work, status, and next actions in the first viewport without a marketing-style hero.
- Use color only where it carries meaning, such as progress or status. Avoid arbitrary accent blocks, flashing motion, and endless floating animation. Respect reduced-motion settings.
- Design loading, empty, error, and disabled states with the same surface system.

## Programming workspace

Use actual `@tuturuuu/ui` Select, Button, Textarea, Tooltip, Tabs, Accordion,
and Resizable components for Programming controls and panels. Keep the Monaco
editor integration specialized. Icon actions need localized accessible names
and tooltips, and collapsed panels must remove their contents from keyboard
interaction. Public case accordions never receive hidden judge cases.

Programming is a full-bleed workspace exception to the dashboard max-width
container. Opt into the shared shell's `contentFullBleed` behavior while
retaining mobile header clearance and safe-area handling. Use semantic theme
colors for informational readiness notices. Code uses the locally bundled
JetBrains Mono with its colocated complete OFL and source notice.

## Ownership and behavior

Learn owns learner and parent-facing education flows; Teach owns teacher operations and authoring. Preserve current routes, data contracts, and cross-app handoffs. Learn and Teach use central platform login and local `/verify-token` completion. Product pages should not duplicate shell chrome or implement local login portals.

### Programming catalog and editor decisions

Programming uses canonical workspace problem UUID routes at
`/[wsId]/programming/problems/[problemId]`. The old Coding entry authorizes the
learner catalog before redirecting to an audited imported UUID; invalid learner
selections are rejected rather than discarded. Empty catalogs return to the index.
The catalog/detail/create/edit pages use the shared internal-api facade to the live
first-class web API. Membership, `manage_users`, and enabled education are required
for authors; linked learners and active parents use the existing Tulearn subject
resolver. Parents remain read only. Learn exposes scoped Programming author CRUD
because this feature specifically requests it; this is an exception to Teach's
usual authoring ownership and reuses its permission boundary.

Catalog pages are bounded to 50 summaries, ordered by immutable UUID with an
explicit next-page cursor. The detail workspace always includes its selected
problem even when outside the first catalog page. Public DTOs carry no hidden case
inputs/answers; global problems are immutable and global author projections remain
public-only. Workspace author hidden cases are confined to the authorized form.
Atomic writes use expected revisions; conflict messages retain unsaved form edits.
The existing runner accepts ten command cases. Authoring permits nine cases and
reserves one slot for an optional learner custom test, without dropping public
cases or changing runner resource, payload, readiness, rate, or security limits.

Editor drafts, custom inputs, language and selected submission/history tab are
stored per tab in session storage, keyed by server-authorized actor, workspace,
learner and problem. Storage failure falls back to memory. Navigation remounts the
workspace by that scope; late responses retain the originating scope. Storage is
never an authorization source. Monaco model paths use the same scope, and source
is restored per language. A reload fetches catalog/problem/access afresh before
hydrating local drafts. Bound history uses opaque problem identity; only the three
byte-audited imported global IDs may include never-bound legacy slug history.
Problem deletion never reclassifies formerly bound history as a legacy submission.

Finite synthetic checks mount the actual catalog, author form, ProgrammingWorkspace,
CodingLab, shared controls, Monaco and local licensed font. Next navigation, font
metadata and server actions are explicit fixtures; these checks do not prove real
Next RSC hydration, auth cookies, product API integration, a full schema replay or
owning-app CI builds. The separate disposable SQL fixture validates only the delta
against synthetic prerequisites and must never replace authoritative generated
public/private/storage database types.
