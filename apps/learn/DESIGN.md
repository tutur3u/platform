# Design System: Tuturuuu Education Satellites

## 1. Visual Theme & Atmosphere

Learn, Teach, and future non-`apps/web` education apps use a confident Neobrutalist product language. The atmosphere is a lively classroom studio: paper-like surfaces, thick ink structure, visible hierarchy, and direct action controls. Density is Daily App Balanced at 5/10, variance is Offset Asymmetric at 8/10, and motion is Fluid CSS plus GSAP choreography at 7/10.

`apps/web` remains the canonical admin platform and may keep its own dashboard language. Education satellites must feel complementary, not like duplicate admin dashboards.

## 2. Theme-Adaptive Color Roles

- Use semantic theme tokens for structure: `bg-root-background`, `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, and shadow values based on `--border` or `--foreground`.
- Use dynamic playful accents for education-specific meaning: `bg-dynamic-yellow`, `bg-dynamic-green`, `bg-dynamic-cyan`, `bg-dynamic-pink`, `bg-dynamic-orange`, and `bg-dynamic-purple`, usually at `/10` to `/15` for surfaces and icon tiles.
- Accent colors should be distributed by function: yellow for daily goals, green for practice or attendance, cyan for modules and maps, pink for assignments and reports, orange for metrics, purple for AI or preview moments.
- Color must work in light, dark, and system themes. Do not hard-code raw hex values or one-off Tailwind color families for app surfaces.
- Heavy ink borders and offset shadows remain structural, but the surrounding cards should carry multiple dynamic accents so Learn and Teach feel playful instead of monochrome.

Avoid purple/blue neon, glowing shadows, oversized gradients, low-contrast translucent side panels, and one-hue palettes.

## 3. Typography Rules

- **Display:** Geist or Cabinet Grotesk - heavy weight, tight hierarchy through weight and layout, not six-line oversized wrapping.
- **Body:** Geist - relaxed leading, max 65 characters per line.
- **Mono:** Geist Mono - numbers, pair codes, compact metrics, and technical labels.
- **Banned:** Inter for premium education satellite work, generic serif fonts, emojis, and fake decorative labels.

Hero headings must use wide containers such as `max-w-6xl` and clamp sizing so they stay within 2-3 lines.

## 4. Component Stylings

- **Buttons:** Rectangular, two-pixel ink borders, theme-safe foreground/background fills, offset shadow, and tactile active translate. Primary actions may use semantic `bg-primary`; supporting actions should use dynamic accent surfaces instead of another plain neutral block.
- **Cards:** Use hard bordered paper blocks with offset shadows. Use cards for meaningful repeated objects only; do not nest cards inside cards.
- **Inputs:** Label above input, square corners, two-pixel border, clear inline error text below. No floating labels.
- **Navigation:** Compact, hard-bordered dock or strip with icon buttons and tooltips when labels are hidden.
- **Loaders:** Skeleton blocks that match final layout dimensions. Avoid generic circular spinners unless inherited from a shared platform utility.
- **Empty States:** Small composed classroom cues with a clear next action, not only "No data" text.

## 5. Layout Principles

Use CSS Grid first. Bento grids must use `grid-flow-dense` and mathematically fill their rows with no empty cells. Avoid generic three-equal-card rows; use asymmetric grids, split work loops, and horizontal rhythm. Auth-gated dashboards should stack secondary rails below the main content until there is enough room for every card to keep readable text on one line or wrapped cleanly without clipping. All layouts collapse to one column below 768px and must never create horizontal scroll.

Every major page follows Navigation, Attention, Interest, Desire, and Action. The first viewport should show the product identity immediately while leaving a hint of the next section visible on common desktop and mobile heights.

## 6. Motion & Interaction

Use GSAP only in isolated client components. Prefer ScrollTrigger pinning, image scale/fade, and staggered card reveals. Animate only `transform` and `opacity`. Active cards and images must have hover physics through scale or offset-shadow movement. Respect `prefers-reduced-motion`.

## 7. Auth & Platform Ownership

Learn and Teach do not own local login portals. Their `/login` routes redirect to `apps/web` with a satellite `returnUrl`, and their `/verify-token` routes complete the local domain session after `apps/web` confirms the current platform account and issues a cross-app token.

Protected education data, workspace writes, and administrative workflows stay in `apps/web`. Satellite apps may own UI shells, preview surfaces, and lightweight companion workflows, but protected APIs must route through the central platform.

## 8. Anti-Patterns (Banned)

- No emojis.
- No local login portals in Learn or Teach.
- No pure black (`#000000`).
- No neon glows, purple-blue AI gradients, hard-coded raw colors, or oversaturated accents.
- No decorative stamp icons, scroll prompts, or bouncing chevrons.
- No generic names like "John Doe", "Acme", or "Nexus".
- No AI copywriting cliches such as "Elevate", "Seamless", "Unleash", or "Next-Gen".
- No centered high-variance hero unless the product context explicitly requires it.
- No files over 400 LOC or components over 200 LOC; split into focused modules and keep public entrypoints stable.
