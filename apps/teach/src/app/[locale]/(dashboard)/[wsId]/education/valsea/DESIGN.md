# Design System: Valsea Classroom Studio

## 1. Visual Theme & Atmosphere

A cockpit-balanced classroom workbench with offset asymmetric composition,
restrained density, and fluid motion. The atmosphere is a language operations
studio: quiet zinc surfaces, a single green provider signal, large editorial
type, and compact teaching artifacts that feel prepared rather than generated.

Density: 6. Variance: 8. Motion: 6.

## 2. Color Palette & Roles

- **Zinc Studio** (#18181B) - Deep page depth and dark-mode structure.
- **Paper Surface** (#FAFAFA) - High-contrast content surface in light areas.
- **Charcoal Ink** (#18181B) - Primary text.
- **Muted Steel** (#71717A) - Secondary labels, helper text, metadata.
- **Whisper Border** (rgba(113,113,122,0.22)) - Structural borders.
- **Provider Green** (#16A34A) - The only accent; used for key state, action readiness, and pipeline confirmation.

No purple/blue neon, no pure black, no oversaturated accent palette.

## 3. Typography Rules

- **Display:** Geist - Track-tight, wide line length, restrained scale.
- **Body:** Geist - Relaxed leading, max 65 characters for descriptions.
- **Mono:** Geist Mono - Provider state, step numbers, and technical metadata.
- **Banned:** Inter, generic serif fonts, giant six-line headings.

## 4. Component Stylings

- **Buttons:** Flat, high-contrast, minimum 44px touch target, subtle transform feedback only.
- **Cards:** Used for workbench hierarchy. Corners are 1.25rem to 2rem; borders carry structure more than shadows.
- **Inputs:** Label above, helper text below, no floating labels. BYOK input uses password type and only persists after validation.
- **Dialog:** Opens automatically when no server key exists. Explains backend key validation, browser-only caching, and uses a single primary action.
- **Pronunciation Model:** A compact select near audio upload. Defaults to local Whisper large-v3 turbo and offers smaller Whisper or Wav2Vec2 options for constrained demos.
- **Scenario Console:** Mira-generated scenarios fill the composer directly and stay visible as a compact mission board.
- **Loading:** Pipeline and generate button show local progress while preserving layout dimensions.
- **Results:** Raw JSON is collapsed by default; the visible surface uses badges, tags, cards, character heatmaps, and score bars.
- **Empty State:** A composed two-zone panel that directs the user to add a key, ask Mira for a scenario, or generate an artifact.

## 5. Layout Principles

Grid-first, asymmetric dashboard layout. The primary composer sits left; the
hero, pipeline, and results stack right. Bento result sections use 6 columns
with dense placement: 3+3, 4+2, 3+3. Mobile collapses to one column with no
horizontal overflow.

## 6. Motion & Interaction

Motion uses GSAP through the shared UI export. Reveals and result cards animate
only `transform` and `opacity`. Clickable panels use restrained hover lift and
scale. No custom cursor, no bouncing arrows, no animated dimensions.

## 7. Anti-Patterns

No emojis. No Inter. No pure black. No neon glows. No fake metrics. No generic
three-card row. No scroll prompt copy. No native browser dialogs. No hidden API
key storage. No overlapping UI zones.
