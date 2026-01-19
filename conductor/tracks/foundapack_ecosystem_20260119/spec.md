# Track Specification: Foundapack Ecosystem & Alphas

## 1. Overview
**Track ID:** `foundapack_ecosystem_20260119`
**Type:** Feature (Content Expansion)
**Goal:** Expand the Foundapack landing page into a full ecosystem showcase. Weave a deeper narrative about scaling from "One" to "Many" to "Infinite," while introducing the core "Alpha" leaders and the technological engine (Tuturuuu) powering the movement.

## 2. Narrative Arc & Visualizations
### 2.1. The Scaling Network (Visual Journey)
A three-stage scrollytelling visualization:
1.  **One (Lone Wolf):** A single, bright but isolated node.
2.  **Many (Wolf Packs):** Small clusters forming (The current startups: Tuturuuu, Noah, AICC). The "Alpha Constellation."
3.  **Infinite (The Galaxy):** The clusters merging into a massive, unbounded network of startups, partners, and resources.

### 2.2. The Alphas (Core Members)
Introducing the founding packs that spark the "Many":
-   **Tuturuuu (The Backer):** Phuc (Founder & CEO), Tien (Growth Lead).
-   **Noah (The Explorer):** Nghi & Toida (Co-founders).
-   **AICC (The Architect):** Shirin, Thao, and Nghi (Co-founders).
*Visual Strategy:* Rendered as the primary "Stars" in the "Alpha Constellation" stage.

### 2.3. The Ecosystem (Backed by Tuturuuu)
The "Infinite" stage is fueled by the Tuturuuu Engine:
-   **Technical Cavalry:** Access to Tuturuuu's core engineering teams.
-   **Power Access:** Full access to paid products (Tudo, TuPlan).
-   **Partner Universe:** Direct link to `https://tuturuuu.com/partners` (VCs, Mentors).

## 3. Functional Requirements
### 3.1. New "Scaling Network" Component
-   **Implementation:** A dynamic canvas/SVG component that transitions between the 3 states (One -> Many -> Infinite) based on scroll.
-   **Content:** Overlay text explaining the exponential power of the network.

### 3.2. "Alpha Constellation" Section
-   **Visual:** Interactive star map.
-   **Interaction:** Hover/Click on specific stars (Founders) to see their details and role within the pack.

### 3.3. "In Association With" Footer
-   **Visual:** Strong branding block. "Powered by Tuturuuu."
-   **Links:** To Tuturuuu main site and Partner page.

## 4. Technical Requirements
-   **Framework:** Next.js (App Router), Framer Motion.
-   **Components:** Create `ScalingNetwork` and `AlphaConstellation` components.
-   **Performance:** Ensure the "Infinite" particle stage is optimized (use canvas if node count > 100, or optimized SVG).

## 5. Acceptance Criteria
-   The transition from Lone Wolf -> Wolf Packs -> Infinite Network is clearly visualized.
-   Core members (Phuc, Tien, Nghi, Toida, Shirin, Thao) are featured.
-   Tuturuuu's backing and benefits are explicitly stated.
