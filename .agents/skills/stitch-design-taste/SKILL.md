---
name: stitch-design-taste
description: "Write a project-specific DESIGN.md for Google Stitch screen generation."
---

# Stitch Design Specification

Create a DESIGN.md that lets Google Stitch generate screens consistent with the
project's brand and intended tasks. Use existing tokens and references when present;
derive missing decisions from the brief rather than imposing a universal aesthetic.

Document only the categories needed by the requested screens:

- Visual atmosphere and content density, with a concrete example of hierarchy.
- Colors named by role, with exact values and accessible foreground/background pairs.
- Typography families, availability, hierarchy, and responsive behavior.
- Layout, spacing, grouping, and behavior at narrow widths and enlarged text sizes.
- Components and their relevant loading, empty, error, focus, and disabled states.
- Motion that conveys state, including reduced-motion and static behavior.

Use plain visual descriptions plus precise tokens. Distinguish requirements from
optional treatments; avoid universal font bans, mandatory asymmetry, or perpetual
animation. Reference supplied imagery accurately and label mock data as illustrative.
Review the specification for internal consistency and sufficient detail to implement
it without forcing every screen into the same structure.
