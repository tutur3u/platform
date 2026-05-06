# Design System: Tulearn Learner Experience

## 1. Visual Theme & Atmosphere

Tulearn is a friendly daily-learning app with a playful classroom rhythm and a polished Tuturuuu product finish. Density is Daily App Balanced at 5/10: enough information for students and parents to know what to do next, never a cockpit. Variance is Offset Asymmetric at 7/10: mission cards, learning paths, and checkpoints should feel lively without becoming chaotic. Motion is Fluid CSS plus GSAP Choreography at 7/10: progress cards cascade, active missions gently breathe, and course paths stack as learners move down the page.

## 2. Color Palette & Roles

- **Canvas Surface** (`bg-background`, approximate #FAFAFA) — Primary app surface.
- **Raised Surface** (`bg-card`, approximate #FFFFFF) — Course cards, practice panels, and form surfaces.
- **Soft Field** (`bg-muted`, approximate #F4F4F5) — Empty states, skeletons, and low-emphasis dashboard areas.
- **Ink Foreground** (`text-foreground`, approximate #18181B) — Primary readable text.
- **Quiet Hint** (`text-muted-foreground`, approximate #71717A) — Helper text, metadata, and secondary labels.
- **Structure Line** (`border-border`, approximate rgba(226,232,240,0.7)) — Dividers and card outlines.
- **Learning Green** (`dynamic-green`) — The single primary accent for CTAs, active nav, XP, success, focus rings, and the daily mission.

Use secondary dynamic tokens only as supporting status color: `dynamic-orange` for hearts/streaks and `dynamic-blue` for reports/marks. Never use neon purple/blue gradients or hard-coded Tailwind color families.

## 3. Typography Rules

- **Display:** Outfit-style rounded sans energy, implemented through the app font stack. Use tight line-height and `clamp()` sizing for friendly but controlled headlines.
- **Body:** Same sans family, relaxed leading, maximum 65 characters per line for descriptions.
- **Mono:** Use only for compact numbers if a future dense analytics surface needs it.
- **Banned:** Inter as an explicit design choice, generic serif fonts, oversized six-line headings, excessive letter spacing, and gradient text on primary titles.

## 4. Component Stylings

* **Buttons:** Minimum 44px tap target. Primary buttons use `bg-dynamic-green text-primary-foreground`; secondary buttons use semantic surfaces. Active state should translate down by 1px or use a soft scale transform. No outer glow.
* **Mission Cards:** Rounded, tactile surfaces with dynamic-token accents. Use cards only when they communicate hierarchy. Avoid cards inside cards.
* **Inputs:** Label above input, helper or error text below. Focus ring should use the app accent through the shared component system.
* **Learner Path Nodes:** Circular or rounded checkpoints with clear completed, current, and locked states. Do not rely on color alone; include icons and labels.
* **Loading States:** Skeleton blocks that match the final layout dimensions. Avoid circular spinners for page skeletons.
* **Empty States:** Friendly composed panels with one clear next action or expectation, never just a single "No data" line.

## 5. Layout Principles

Use CSS Grid for mission boards and learner paths. Desktop pages max out around 1400px and keep asymmetric spacing. Mobile collapses to one column with the bottom navigation visible and all touch targets at least 44px. Full-height marketing surfaces use `min-h-[100dvh]`; dashboard surfaces should avoid horizontal overflow and fixed `h-screen`.

Avoid the generic three-equal-card feature row. Prefer one large mission card plus smaller supporting cards, a path map, or a horizontal/stacked quest list.

## 6. Motion & Interaction

Use GSAP for dashboard chapter reveals, pinned journey titles, and stacked lesson cards. Animate only `transform` and `opacity`. Active mission elements should have subtle perpetual motion: pulse, float, shimmer, or progress shimmer. Lists should cascade in with staggered timing. Respect reduced-motion settings.

## 7. Anti-Patterns (Banned)

No emojis. No hard-coded color classes such as `text-white`, `bg-blue-*`, or hex colors in UI code. No pure black. No neon glows. No centered hero when the layout calls for asymmetry. No overlapping text. No fake round-number stats. No generic placeholder people. No AI copywriting cliches. No custom cursors. No scroll arrows or filler instructions. No broken Unsplash links; use `picsum.photos` for generated visual texture when needed.
