# Track Specification: Foundapack Rebirth

## 1. Overview
**Track ID:** `foundapack_rebirth`
**Type:** Feature (Refactor/Redesign)
**Goal:** Scrape the existing UI/components of `@apps/foundapack` and rebuild the landing page experience from the ground up within the existing app structure.
**Core Metaphor:** "The Pack & The Flame" – A visceral, emotional journey from the freezing cold of isolation to the roaring warmth of collective purpose, set against the backdrop of an infinite night sky.
**Narrative Arc:**
1.  **The Lone Wolf (Pain):** The brutal reality of the solitary founder. Cold, dark, vulnerable.
2.  **The Howl (Call to Action):** The signal that you are not alone.
3.  **The Pack (Solution):** Strength in numbers. The "Peer-Driven" model.
4.  **The Fire (Impact):** What we build together changes the world (appealing to partners/investors).

## 2. Functional Requirements
### 2.1. Infrastructure
-   **Action:** Delete existing `src/components/*` and `src/app/page.tsx`.
-   **Preserve:** App configuration (`next.config.ts`, `package.json`, `postcss.config.mjs`, `tailwind.config.ts` if present).
-   **Setup:** Create a new directory structure for the storytelling components.

### 2.2. The Experience (Scroll Journey)
The page must flow seamlessly as a single "insane setup" story:

1.  **Scene I: The Tundra (Hero)**
    -   **Visual:** Stark, beautiful desolation. A deep night sky, moon, stars, and a single set of footprints.
    -   **Copy:** "The hardest walk is walking alone." (Relatable struggle).
    -   **Action:** User scrolls to "Find warmth."

2.  **Scene II: The Gathering (Vision/Mission)**
    -   **Visual:** Eyes in the dark? Shadows converging? A spark.
    -   **Narrative:** Transition from "I" to "We".
    -   **Core Concept:** "No student founder builds alone."

3.  **Scene III: The Campfire (The Product/Hub)**
    -   **Visual:** The central hub. Warm, cozy, animated fire effects (embers, glow). Contrast the cold night with the warm circle.
    -   **Content:**
        -   **Peer-to-Peer:** "We trade scars for wisdom." (Sharing sessions).
        -   **Incubation:** "Iron sharpens iron." (Workshops/Internal growth).
        -   **The 2026 Run:** Jan-June Timeline visualized as a hunt or expedition map.

4.  **Scene IV: The Hunt (Impact for Partners/Investors)**
    -   **Visual:** The Pack moving together. High energy. Momentum.
    -   **Narrative:** This isn't just a club; it's an engine for human progress.
    -   **Pitch:** "Invest in the collective force, not just the individual."

5.  **Scene V: Join the Pack (Footer/CTA)**
    -   **Visual:** The user sitting by the fire.
    -   **CTA:** "Take your place."

### 2.3. Technical Requirements
-   **Framework:** Next.js (App Router).
-   **Styling:** Tailwind CSS (Strict adherence to monorepo UI tokens + Custom "Pack" theme).
-   **Animation:** High-fidelity Framer Motion.
    -   Scroll-linked animations (Parallax, reveal, morphing).
    -   Atmospheric effects (Snow, sparks, breathing glow).
-   **Visualizations:**
    -   **Network Effect:** A specific, high-quality visualization showing how isolated nodes (stars/founders) connect to form a powerful constellation/network. This must "click" instantly.

## 3. Design Guidelines
-   **Vibe:** Cinematic, Emotional, "High-Stakes", Primal but Futuristic.
-   **Visual Clarity:** Use abstract visuals, geometric metaphors, or high-quality ASCII art/canvas visualizations to simplify complex concepts.
-   **Palette:**
    -   *Background:* Deep Void Black/Blue (`#0b0b10`), Midnight Blue.
    -   *Elements:* Starlight Silver/White (Cold), Campfire Amber/Gold/Orange (Warmth).
-   **Typography:** Editorial style. Big statements.

## 4. Out of Scope
-   Backend integration.
-   Authentication.
