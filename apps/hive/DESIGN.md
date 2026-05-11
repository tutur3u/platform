# Hive Design Rules

Hive is a dense research editor, not a marketing site. The first viewport is the working voxel engine: full-bleed 3D scene, compact navigator, tool dock, inspector, and NPC lab.

## Visual System

- Base palette: Zinc and Slate neutrals with softened contrast. Avoid pure black; use `zinc-950`, `zinc-900`, `zinc-800`, and muted borders.
- Accent: one muted green family for active state, affordance, and status. Use warm clay, path tan, roof blue, crop green, and wood brown only inside voxel assets where they describe objects.
- Typography: Outfit or Geist. Do not use Inter.
- Corners: editor panels and controls use 4-8px radius. Avoid pill-heavy styling.
- Shadows: use restrained depth for floating tool surfaces. Do not add gradient orbs, bokeh, neon purple, or blue glows.

## Layout

- Full-bleed perspective viewport is the main surface.
- Use the shared `@tuturuuu/satellite` workspace shell for structural rails and viewport slots, then layer Hive-specific controls inside those slots.
- Left side owns server/world navigation and admin-only server controls.
- Bottom dock owns tools, swatches, object choices, undo, and redo.
- Right side owns the selected entity inspector.
- NPC Lab is anchored in the viewport top chrome and exposes role, backstory, prompt mode, memory toggles, model, system prompt, and manual run controls without overlapping the inspector.
- Left/right rails, top research chrome, NPC Lab, and the bottom dock must be collapsible from compact icon controls.
- Do not use generic three-card rows or explanatory landing sections.
- The generated visual reference for the current landing/editor direction lives at `public/hive-landing-reference.png`; use it as a mood board, not as a literal UI screenshot to embed.

## Motion

- Tile animation must use transform, opacity, material color, or shader-safe frame updates. Never use layout-affecting CSS animation for the editor scene.
- Object previews should snap to the voxel grid and feel tactile.
- Keep the editable grid unrotated. Perspective belongs to the camera/control rig so raycast placement matches the cursor.

## Content

- Use direct editor labels. Do not add visible instructional prose about keyboard shortcuts, layout, or feature explanations.
- No emojis in UI copy.
- Research controls should make experimental variables explicit: default/enhanced/custom prompt, memory enabled, backstory enabled, editable system prompt, model settings, and run logs.
