# Track Specification: Sophisticated Auto-Scheduler & Locked Events

## 1. Overview
This track aims to implement a highly sophisticated and resilient auto-scheduling algorithm for tasks, habits, and events. A key requirement is the introduction of "Locked Events"—items that are strictly immutable by the auto-scheduler. The update also includes enhanced configuration options in the workspace settings, allowing users to define buffer times and energy-based preferences. Additionally, users must be able to view all generated instances of their scheduled items.

## 2. Functional Requirements

### 2.1 Locked Events (Immutable Anchors)
*   **Strict Immutability:** Any event, task, or habit instance marked as "Locked" MUST NOT be moved, resized, or altered by the auto-scheduling algorithm under any circumstance.
*   **Conflict Resolution:** If a locked event creates a conflict that cannot be resolved by moving other items, the scheduler must flag the conflict to the user rather than modifying the locked item.
*   **UI Indication:** Locked items must be visually distinct in the UI (e.g., a padlock icon or distinct border style) to indicate their immutable status.

### 2.2 Sophisticated Auto-Scheduling Algorithm
*   **Optimization Goal:** Minimize gaps and maximize productivity while strictly adhering to "Locked" constraints.
*   **Prioritization:** The algorithm must respect task priority (High, Medium, Low) and deadlines.
*   **Habit Intelligence:**
    *   **Streak Protection:** Habits with active streaks receive higher scheduling priority to prevent breaking the chain.
    *   **Cluster Prevention:** The algorithm should avoid scheduling multiple flexible habits back-to-back to prevent user burnout.
    *   **Smart Adaptive Windows:** If a habit is missed, the scheduler attempts to reschedule it *only* if it makes semantic sense (e.g., rescheduling "Lunch" to 9 PM is forbidden; rescheduling "Read Book" to evening is allowed).

### 2.3 Buffer Time Configuration
*   **New Settings:** Add a new section to `apps/web/src/components/settings/settings-dialog.tsx` (specifically under the Calendar or Tasks tab).
*   **Configuration Logic:**
    *   **Minimum Buffer:** A hard constraint (e.g., "Always keep at least 5 mins between tasks").
    *   **Preferred Buffer:** A soft constraint (e.g., "Try to keep 15 mins between tasks").
*   **Application:** These buffers apply to the auto-scheduler's placement logic for all non-locked items.

### 2.4 Energy Alignment Settings
*   **User Configuration:** Add settings to allow users to define their "Energy Profile" (e.g., Morning Person vs. Night Owl).
*   **Task Matching:** The scheduler should preferentially place high-cognitive-load tasks during the user's peak energy hours and low-load tasks/habits during off-peak hours.

### 2.5 Instance Visibility
*   **All-Instances View:** Users must have a way to view all scheduled instances of a task or habit (e.g., a "Schedule History" or "Upcoming Instances" list view).
*   **Audit Trail:** Provide clarity on why an instance was scheduled at a specific time (e.g., "Scheduled based on Morning Energy preference").

## 3. Non-Functional Requirements
*   **Performance:** The rescheduling calculation should complete within < 200ms for a typical week's view to ensure the UI feels responsive.
*   **Test Coverage:** High test coverage is mandatory.
    *   Unit tests for the scheduling engine logic (testing various constraint combinations).
    *   Integration tests for the "Locked" behavior to guarantee immutability.
    *   Edge case testing for the "Smart Adaptive Windows" (e.g., time-bound habits).
    *   **Real-world Scenarios:** Tests MUST simulate diverse real-world contexts (e.g., "Student Schedule," "9-5 Work," "Freelancer") to verify algorithm robustness.

## 4. Acceptance Criteria
*   [ ] Users can mark any event/task as "Locked," and the auto-scheduler never moves it.
*   [ ] A new "Buffer Time" setting (Min vs. Preferred) is available in the Settings Dialog and affects scheduling.
*   [ ] Habits with streaks are prioritized over generic low-priority tasks.
*   [ ] "Lunch" type habits are not rescheduled to inappropriate times (e.g., late night) if missed.
*   [ ] Users can configure energy preferences, and the scheduler respects them by placing demanding tasks in peak windows.
*   [ ] Users can view a comprehensive list of all scheduled instances for tasks and habits.
*   [ ] Existing tests pass, and new comprehensive tests verify the algorithm's "sophistication."

## 5. Out of Scope
*   AI-based prediction of user energy levels (this track relies on manual user configuration of energy profiles).
*   Integration with external hardware (wearables) for real-time energy tracking.
