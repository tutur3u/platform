# Hive Design Rules

Hive is a dense research editor, not a marketing site. The first viewport is the working voxel engine: full-bleed 3D scene, compact status chips, tool dock, inspector, and NPC lab.

## Visual System

- Base palette: Zinc and Slate neutrals with softened contrast. Avoid pure black; use `zinc-950`, `zinc-900`, `zinc-800`, and muted borders.
- Accent: one muted green family for active state, affordance, and status. Use warm clay, path tan, roof blue, crop green, and wood brown only inside voxel assets where they describe objects.
- Typography: Outfit or Geist. Do not use Inter.
- Corners: editor panels and controls use 4-8px radius. Avoid pill-heavy styling.
- Shadows: use restrained depth for floating tool surfaces. Do not add gradient orbs, bokeh, neon purple, or blue glows.

## Layout

- Full-bleed perspective viewport is the main surface.
- Use the shared `@tuturuuu/satellite` workspace shell for structural rails and viewport slots, then layer Hive-specific controls inside those slots.
- Bottom dock owns server/world selection, tools, swatches, object choices, and environment settings.
- Right side owns the selected entity inspector.
- NPC Lab is anchored in the viewport top chrome and exposes role, backstory, prompt mode, memory toggles, model, system prompt, and manual run controls without overlapping the inspector.
- Right rail, top research chrome, NPC Lab, chat composer, mini-map, and the bottom dock must be collapsible from compact icon controls. Collapsed slots must not leave invisible hover targets or tooltips behind.
- Keep the active server name on one dock line with its server icon and menu affordance.
- Bottom dock secondary surfaces are explicit panel toggles, not hover-only
  expansion. Build catalog, editor settings, and live operations each have a
  visible icon button and persist until the operator chooses another panel.
- Live operations in the dock should summarize existing snapshot data only:
  world counts, crops, warehouses, currency, events, online users, realtime
  status, revision, and the last sync notice.
- NPC Lab edits the selected NPC. If no NPC is selected, it should ask for an
  NPC selection instead of silently editing the first NPC.
- Render voxel terrain with a minimal tile gap by default. Gapless rendering is an optional setting, not the default visual state.
- Do not use generic three-card rows or explanatory landing sections.
- The generated visual reference for the current landing/editor direction lives at `public/hive-landing-reference.png`; use it as a mood board, not as a literal UI screenshot to embed.

## Motion

- Tile animation must use transform, opacity, material color, or shader-safe frame updates. Never use layout-affecting CSS animation for the editor scene.
- Object previews should snap to the voxel grid and feel tactile.
- Keep the editable grid unrotated. Perspective belongs to the camera/control rig so raycast placement matches the cursor.
- Camera views should be explicit editor modes. At minimum keep isometric, wide, close, and top-down presets available from the dock.

## Content

- Use direct editor labels. Do not add visible instructional prose about keyboard shortcuts, layout, or feature explanations.
- No emojis in UI copy.
- Research controls should make experimental variables explicit: default/enhanced/custom prompt, memory enabled, backstory enabled, editable system prompt, model settings, and run logs.
- Environment controls use a continuous 24-hour time slider plus season and weather buttons. Do not reintroduce the five fixed visible time buttons as the main control.
