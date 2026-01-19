# Specification: Foundapack - The Lone Wolf & Footer Revamp

## Overview
Elevate the immersive experience of the Foundapack landing page by revamping the initial "Lone Wolf" visualization, fixing scroll-related issues, and redesigning the footer to be more thematic and informative.

## Functional Requirements

### 1. "The Lone Wolf" Visualization (Scaling Network Phase 1)
- **Visuals:** 
  - Introduce a stylized, animated wolf silhouette that "breathes" or subtly shifts its gaze.
  - Set against a dynamic, moving night sky background.
- **Behavior (Sticky Depth):**
  - The visualization should remain sticky/fixed in the background while content scrolls over it.
  - Resolve existing scrolling issues where sections might be missed or triggers are inconsistent.
  - Transitions into the "Many" (Pack) state should feel cinematic and layered.

### 2. Thematic Footer Revamp
- **Lore-based Navigation:** Replace generic links with thematic alternatives (e.g., "Join the Hunt", "The Den", "Pack Emblems").
- **Interactive Campfire:** Add a visual "campfire" anchor at the bottom that reacts to mouse proximity or scroll.
- **Backer Recognition:** Include a dedicated section or message from **Tuturuuu**, highlighting them as the major backer and technical force behind Foundapack.

### 3. Global Aesthetic & Transitions
- **Parallax Layers:** Implement multi-layered parallax for stars, smoke, and silhouettes to create deep space.
- **Atmospheric Transitions:** 
  - **Ember Trails:** Floating embers that guide the eye during section changes.
  - **Fog/Mist Pass:** Subtle dark mist to soften transitions between different scenes.

## Non-Functional Requirements
- **Performance:** Ensure animated silhouettes and parallax layers maintain 60fps on modern devices.
- **Responsiveness:** Maintain the "sticky depth" feel across mobile and desktop.

## Acceptance Criteria
- [ ] "The Lone Wolf" state features a breathing/animated silhouette.
- [ ] The sticky background behavior is smooth and doesn't skip or "jump" during scroll.
- [ ] Footer links are thematic and reflect "wolf pack" lore.
- [ ] Tuturuuu's backing is clearly and elegantly communicated in the footer.
- [ ] Transitions between scenes are softened by mist and enhanced by embers.
