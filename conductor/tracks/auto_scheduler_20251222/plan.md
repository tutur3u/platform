# Track Plan: Sophisticated Auto-Scheduler & Locked Events

## Phase 1: Database and Schema Preparation
*   [x] Task: Verify and Extend Schema for Scheduling [01b903d]
    *   Subtask: Verify `is_locked` (or equivalent) exists in `workspace_calendar_events` (based on `event-card.tsx`).
    *   Subtask: Add `energy_profile` and `scheduling_buffer` columns to `workspaces` (or a new `workspace_scheduling_settings` table).
    *   Subtask: Update Types: Run `bun sb:typegen` and update `@tuturuuu/types`.
*   [ ] Task: Conductor - User Manual Verification 'Database and Schema Preparation' (Protocol in workflow.md)

## Phase 2: Core Algorithm Implementation (TDD)
*   [x] Task: Implement Locked Event Protection in Scheduling Engine [26669d9]
    *   Subtask: Write failing tests verifying that existing "Locked" events remain immovable.
    *   Subtask: Integrate the existing `locked` flag into the new scheduler's constraint logic.
    *   Subtask: Verify all tests pass.
*   [x] Task: Implement Priority and Streak-Aware Scheduling [26669d9]
    *   Subtask: Write failing tests for priority-based placement and streak protection.
    *   Subtask: Update algorithm to weight habits with active streaks higher.
    *   Subtask: Verify tests pass.
*   [x] Task: Implement Buffer Time and Energy Alignment Logic [26669d9]
    *   Subtask: Write failing tests for min/preferred buffers and energy-peak task placement.
    *   Subtask: Integrate workspace scheduling settings into the algorithm.
    *   Subtask: Verify tests pass.
*   [x] Task: Implement Smart Adaptive Windows for Habits [26669d9]
    *   Subtask: Write failing tests for semantic rescheduling (e.g., preventing "Lunch" at midnight).
    *   Subtask: Implement time-of-day constraints for specific habit types.
    *   Subtask: Verify tests pass.
*   [x] Task: Conductor - User Manual Verification 'Core Algorithm Implementation' (Protocol in workflow.md) [checkpoint: 26669d9]

## Phase 3: Settings UI and Instance Visibility
*   [ ] Task: Add Scheduling Settings to Settings Dialog
    *   Subtask: Update `apps/web/src/components/settings/settings-dialog.tsx` to include buffer and energy settings.
    *   Subtask: Implement state management and Supabase sync for new settings.
*   [ ] Task: Ensure Locked Status Consistency across UI
    *   Subtask: Verify `locked` toggle works for all schedulable items (tasks/habits) consistent with `event-card.tsx`.
    *   Subtask: Ensure the visual padlock indicator appears correctly in all relevant views.
*   [ ] Task: Implement "All Instances" View
    *   Subtask: Create a new component to list all scheduled instances of a task/habit.
    *   Subtask: Add "Why was this scheduled here?" tooltip or audit info to instances.
*   [ ] Task: Conductor - User Manual Verification 'Settings UI and Instance Visibility' (Protocol in workflow.md)

## Phase 4: Integration and Final Polish
*   [ ] Task: Performance Optimization and Final Audit
    *   Subtask: Profile the scheduling algorithm with large datasets (e.g., 500+ tasks).
    *   Subtask: Ensure rescheduling completes within < 200ms.
    *   Subtask: Run final end-to-end tests for the entire scheduling flow.
*   [ ] Task: Conductor - User Manual Verification 'Integration and Final Polish' (Protocol in workflow.md)
