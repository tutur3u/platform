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
