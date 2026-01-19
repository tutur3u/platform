# Implementation Plan: Foundapack Aesthetic Overhaul

This plan outlines the steps to transform Foundapack into an immersive "Wolf Pack & Campfire" experience, featuring "The Council" and "Pack Emblems".

## Phase 1: Foundation & Asset Integration [checkpoint: 77df975]
- [x] **Task: Setup Member and Project Data** [b79a0d7]
    - [x] Define the data structure for the 8 core members and 3 project ventures.
    - [x] Create a centralized constants file for this data.
- [x] **Task: Integrate Project Preview Images** [f868afa]
    - [x] Add preview images for Tuturuuu, AICC, and Noah to the public directory.
- [x] **Task: Theme & Typography Foundation** [0c66b16]
    - [x] Update `tailwind.config.ts` or `pack.css` with new thematic font families (rugged serif/handwritten).
    - [x] Define organic texture overlays in CSS.
- [x] **Task: Conductor - User Manual Verification 'Foundation & Asset Integration' (Protocol in workflow.md)**

## Phase 2: Core Aesthetic Overhaul [checkpoint: 2dd90ef]
- [x] **Task: Implement Deep Lighting & Textures** [2dd90ef]
    - [x] Update `pack.css` with advanced radial gradients for "Campfire Glow".
    - [x] Add organic wood/fur texture overlays to background layers.
- [x] **Task: Enhance Global Atmosphere** [2dd90ef]
    - [x] Refine `NightSky` with deeper depth and varied star intensities.
    - [x] Update `PackBackground` with "weightier" ember particles and smoke wisps.
- [x] **Task: Organic Layout Refactoring** [2dd90ef]
    - [x] Modify `page.tsx` to break the standard grid with staggered, organic section transitions.
- [x] **Task: Conductor - User Manual Verification 'Core Aesthetic Overhaul' (Protocol in workflow.md)**

## Phase 3: The Council (Alpha Pack) [checkpoint: fbd6af4]
- [x] **Task: Create Member Card Component** [fbd6af4]
    - [x] Implement `MemberCard` component with the "Spectral Silhouette" placeholder.
    - [x] Add "Magnetic" effect using `useMagnetic` hook.
    - [x] Add "Campfire Glow" hover state with intense lighting.
- [x] **Task: Build The Council Section** [fbd6af4]
    - [x] Create `TheCouncil` section to display all 8 core members.
    - [x] Implement the "Alpha Pack" grouping (Tuturuuu, AICC, Noah).
- [x] **Task: Implement Project Linkage** [fbd6af4]
    - [x] Ensure clicking cards or links navigates correctly to project URLs.
- [x] **Task: Conductor - User Manual Verification 'The Council (Alpha Pack)' (Protocol in workflow.md)**

## Phase 4: Pack Emblems & Final Polish [checkpoint: 1f18663]
- [x] **Task: Implement Pack Emblems Section** [1f18663]
    - [x] Create a visual gallery for the "Project Territory" using website previews.
    - [x] Apply thematic borders and lighting to the emblem cards.
- [x] **Task: Performance & Animation Refinement** [1f18663]
    - [x] Audit scroll performance (target 60fps) for all high-fidelity effects.
    - [x] Ensure mobile responsiveness for the organic layout.
- [x] **Task: Final Aesthetic Pass** [1f18663]
    - [x] Fine-tune ember counts, glow intensities, and animation timings.
- [x] **Task: Conductor - User Manual Verification 'Pack Emblems & Final Polish' (Protocol in workflow.md)**
