---
name: design-taste-frontend
description: "Design expressive web interfaces with deliberate hierarchy, density, and motion."
---

# Expressive Frontend Design

Start from the product's audience, primary task, existing visual system, and the
requested degree of change. Choose density, composition, and motion to serve that
context. A routine component fix does not call for a new design system.

- Establish clear hierarchy with type, spacing, and grouping. Use cards where they
  communicate a unit of content or action; use open layouts elsewhere.
- Preserve the existing framework, theme tokens, icon package, and fonts unless
  changing them is part of the brief. Confirm dependencies before importing them.
- Keep interactive state in the appropriate client boundary. Server components can
  fetch and compose data; they need not be reduced to static markup.
- Design loading, empty, error, disabled, focus, and success states for the actual
  interactions. Never fabricate customer claims, testimonials, or production metrics.
- Use responsive grids and content-driven breakpoints. Preserve reading and tab order,
  allow text scaling, and verify localized copy at phone and laptop widths.
- Motion should clarify state or support the visual concept. CSS is sufficient for
  many interactions; use an existing animation library for complex choreography.
  Clean up effects, respect reduced motion, and keep content usable without animation.

Prefer one coherent visual direction over combining conflicting taste presets.
Use source assets, generated artwork when useful, or clearly marked placeholders.
Stop iterating when the requested surface is implemented and its material usability
and visual issues are resolved; report any unavailable runtime checks honestly.
