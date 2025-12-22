# Analysis: Refactoring Targets

## Summary
This analysis identifies the largest source files in the codebase that require refactoring to improve maintainability and readability. The focus is on files exceeding 400 LOC and complex components.

## Top 10 Refactoring Candidates (by Line Count)

1.  **`apps/web/src/app/[locale]/(dashboard)/[wsId]/time-tracker/components/timer-controls.tsx`** (~5119 LOC)
    *   **Severity:** Critical
    *   **Type:** React Component (UI)
    *   **Action:** Decompose into smaller sub-components (e.g., TimerDisplay, Controls, Settings). Move logic to custom hooks.

2.  **`packages/utils/src/task-helper.ts`** (~3207 LOC)
    *   **Severity:** Critical
    *   **Type:** Utility Library
    *   **Action:** Split into domain-specific utility modules (e.g., `task-status.ts`, `task-date.ts`, `task-validation.ts`).

3.  **`apps/web/src/app/[locale]/(dashboard)/[wsId]/tasks/logs/logs-timeline.tsx`** (~2452 LOC)
    *   **Severity:** High
    *   **Type:** React Component (UI)
    *   **Action:** Extract list items, filters, and timeline rendering logic into separate components.

4.  **`apps/web/src/lib/calendar/unified-scheduler.ts`** (~2398 LOC)
    *   **Severity:** High
    *   **Type:** Core Logic / Library
    *   **Action:** Break down scheduling algorithms into distinct strategies or service classes.

5.  **`packages/ui/src/components/ui/tu-do/boards/boardId/kanban.tsx`** (~2254 LOC)
    *   **Severity:** High
    *   **Type:** React Component (Complex UI)
    *   **Action:** Separate Board, Column, and Card rendering. Extract drag-and-drop logic to `useKanban` hook.

6.  **`apps/discord/commands.py`** (~2159 LOC)
    *   **Severity:** High
    *   **Type:** Python Module (Backend)
    *   **Action:** Group commands into Cog classes or separate modules by domain (e.g., `cogs/admin.py`, `cogs/utility.py`).

7.  **`apps/web/src/app/[locale]/(dashboard)/[wsId]/calendar/components/time-tracker.tsx`** (~2038 LOC)
    *   **Severity:** High
    *   **Type:** React Component (UI)
    *   **Action:** Extract sub-components for tracking history, active timer, and analytics.

8.  **`packages/ui/src/hooks/use-calendar.tsx`** (~1934 LOC)
    *   **Severity:** High
    *   **Type:** React Hook
    *   **Action:** Split into smaller hooks (e.g., `useCalendarEvents`, `useCalendarNavigation`, `useCalendarView`).

9.  **`apps/web/src/app/[locale]/(dashboard)/[wsId]/tasks/projects/[projectId]/task-project-detail.tsx`** (~1904 LOC)
    *   **Severity:** Medium
    *   **Type:** React Page/Component
    *   **Action:** Decompose page layout and extract complex widgets.

10. **`packages/ui/src/components/ui/tu-do/boards/boardId/task.tsx`** (~1813 LOC)
    *   **Severity:** Medium
    *   **Type:** React Component
    *   **Action:** Extract task details, comments, and subtask lists into separate components.

## Recommendations
*   **Immediate Action:** Begin with `timer-controls.tsx` and `task-helper.ts` as they are the largest outliers.
*   **Strategy:** For React components, prioritize extracting "dumb" UI components first, then move complex state logic to custom hooks. For utility files, group functions by domain and split into separate files.
