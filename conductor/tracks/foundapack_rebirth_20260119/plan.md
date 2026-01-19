# Implementation Plan: Foundapack Rebirth

## Phase 1: Ground Zero & Foundations
- [x] Task: Scrape existing `@apps/foundapack` UI files 3b96ebd
    - [x] Delete `apps/foundapack/src/app/page.tsx`
    - [x] Delete all files in `apps/foundapack/src/components/`
- [x] Task: Setup Theme & Global Styles 3b96ebd
    - [x] Update `apps/foundapack/src/app/pack.css` with core storytelling variables (Void Black, Midnight Blue, Campfire Amber, Starlight Silver)
    - [x] Ensure `RootLayout` correctly integrates the new CSS
- [x] Task: Conductor - User Manual Verification 'Phase 1: Foundation' (Protocol in workflow.md) [checkpoint: fb44f63]

## Phase 2: Atmospheric Core
- [x] Task: Implement `NightSky` component 97e1e22
    - [x] Write tests for background rendering and layer stacking
    - [x] Implement starfield, moon, and noise texture layers
- [x] Task: Implement `PackBackground` (The Persistent Atmosphere) f9b0d2d
    - [x] Create a container for atmospheric effects (floating embers, subtle snow)
    - [x] Ensure smooth transitions between "Cold" and "Warm" states
- [x] Task: Implement `NetworkEffect` Visualization 0fe29c7
    - [x] Write unit tests for node-connection logic
    - [x] Create an interactive "Constellation" visualization (isolated stars linking on scroll/hover)
- [x] Task: Conductor - User Manual Verification 'Phase 2: Atmospheric Core' (Protocol in workflow.md) [checkpoint: 070f452]

## Phase 3: The Journey (Scene Implementation)
- [x] Task: Implement `SceneI_Tundra` (Isolation) 1e01f3f
    - [x] Write tests for viewport detection and initial state
    - [x] Implement the lone footprint visual and "Lone Wolf" copy
- [x] Task: Implement `SceneII_Gathering` (Vision) f175b8b
    - [x] Write tests for the "Howl" trigger and converge animation
    - [x] Implement the visual transition from isolation to connection
- [x] Task: Implement `SceneIII_Campfire` (Programs) a73046e
    - [x] Write tests for campfire flickering logic and interactive cards
    - [x] Implement the 2026 expedition map (timeline) and peer-driven hub details
- [x] Task: Implement `SceneIV_Hunt` (Partners/Impact) a04b91c
    - [x] Implement high-energy momentum visuals (The Pack moving)
    - [x] Integrate the "Network Effect" into the partner/investor pitch section
- [~] Task: Implement `SceneV_Join` (CTA)
    - [ ] Implement the "sitting by the fire" visual and final CTA button
- [x] Task: Conductor - User Manual Verification 'Phase 3: The Journey' (Protocol in workflow.md) [checkpoint: 7bafd56]

## Phase 4: Performance & Narrative Polish
- [x] Task: Scrollytelling Optimization 393ec1c
    - [x] Audit Framer Motion usage for performance
    - [x] Implement lazy-loading or optimized animations
- [x] Task: Final Narrative Review 393ec1c
    - [x] Ensure copy, timing, and visuals "click"
- [x] Task: Conductor - User Manual Verification 'Phase 4: Final Polish' (Protocol in workflow.md) [checkpoint: 0b0c97b]
