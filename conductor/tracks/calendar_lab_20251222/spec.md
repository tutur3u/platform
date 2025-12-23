# Specification: Smart Scheduling Algorithm Lab

## 1. Overview
Create a dedicated "Algorithm Lab" environment within the web application to visualize, test, and debug the smart scheduling calendar algorithm (`TuPlan`). This tool will allow engineers to simulate complex scheduling scenarios, visualize decision-making logic, and tune parameters in real-time using a high-quality, user-friendly interface that mirrors the production calendar experience.

## 2. User Stories
*   **As an Engineer**, I want to access a protected "Lab" page so I can test the scheduling algorithm without affecting real user data.
*   **As an Engineer**, I want to load standard test scenarios (e.g., "Overloaded Day", "Complex Habits") or import real workspace data to reproduce bugs.
*   **As an Engineer**, I want to generate realistic random scenarios (e.g., "Busy Executive Schedule") to stress-test the algorithm.
*   **As an Engineer**, I want to step through the scheduling process one task at a time to understand why a specific time slot was chosen.
*   **As an Engineer**, I want to see visual overlays (heatmaps, scores) explaining the algorithm's "fitness" evaluation for different slots.
*   **As an Engineer**, I want to tweak algorithm weights (e.g., priority vs. streak) and see the schedule update instantly to find optimal default settings.

## 3. Functional Requirements

### 3.1 Access & Routing
*   **Route:** New page at `apps/web/src/app/[locale]/(dashboard)/[wsId]/calendar/lab/page.tsx`.
*   **Permissions:** Strictly restricted to Tuturuuu internal employees (verify via `isTuturuuuEmail()` or specific permission flag).
*   **Layout:** Inherit the standard Dashboard layout but replace the main content area with the Lab interface.

### 3.2 Scenario Management (The Simulation Engine)
*   **Preset Loader:** Ability to load static JSON scenarios (defined in code) representing edge cases.
*   **Real Data Import:** Functionality to fetch current tasks/events from the active workspace and load them into the simulation state (read-only/detached from DB).
*   **Realistic Generator:** A generator tool that creates "relatable" data (e.g., named tasks like "Client Meeting", "Gym", "Code Review" instead of "Task A") with varying attributes (duration, priority, deadlines) to mimic real usage.

### 3.3 Algorithm Visualization & Control
*   **Visualizer UI:** Reuse the main `CalendarClientPage` components but wrapped in a "Lab Context" that allows overlay rendering.
*   **Step-by-Step Playback:** Controls to "Play", "Pause", "Next Step", and "Prev Step" the scheduling algorithm's placement logic.
*   **Decision Overlays:**
    *   **Score Heatmap:** Color-coded time slots showing availability/score.
    *   **Log/Tooltip:** Hovering over a placed task shows *why* it was placed there (constraints met, score value).
*   **Parameter Tuning:** A side panel to adjust algorithm constants/weights (if applicable/exposed) and trigger a re-run.
*   **Diff View:** (Optional for V1, good to have) Toggle between "Original" and "Optimized" views.

## 4. Non-Functional Requirements
*   **Performance:** The simulation should run entirely client-side (or server-side with localized state) to ensure fast feedback loops.
*   **UX/UI:** Must maintain the high design standards of Tuturuuu. The debugging tools should feel like a professional IDE, not a rough internal hack.
*   **Isolation:** The Lab **MUST NOT** write changes back to the real database. All manipulation happens in a volatile state.

## 5. Out of Scope
*   Persisting lab scenarios to the database (except maybe as a downloadable JSON).
*   Mobile optimization for the Lab interface (Desktop focus).
