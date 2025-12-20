# Track Plan: Project Maintenance & Optimization

## Phase 1: Assessment and Strategy
*   [x] Task: Analyze Codebase for Refactoring Targets [cd519d0]
    *   Identify files exceeding 400 LOC and components exceeding 200 LOC.
    *   Prioritize targets based on complexity and churn.
*   [x] Task: Audit Data Fetching Patterns [73fc254]
    *   Scan for usage of `useEffect` for data fetching.
    *   List locations requiring migration to TanStack Query.
*   [x] Task: Conductor - User Manual Verification 'Assessment and Strategy' (Protocol in workflow.md) [checkpoint: 794eca7]

## Phase 2: Refactoring Core Components
*   [x] Task: Refactor Priority 1 Large Files [c5cb553]
    *   Subtask: Create tests for existing functionality to ensure regression safety.
    *   Subtask: Extract logic/components to reduce file size.
    *   Subtask: Verify functionality.
*   [ ] Task: Refactor Priority 2 Large Files
    *   Subtask: Create tests for existing functionality.
    *   Subtask: Extract logic/components.
    *   Subtask: Verify functionality.
*   [ ] Task: Conductor - User Manual Verification 'Refactoring Core Components' (Protocol in workflow.md)

## Phase 3: Data Fetching Migration
*   [ ] Task: Migrate Group A Components to TanStack Query
    *   Subtask: Write tests for current behavior.
    *   Subtask: Replace `useEffect` fetch with `useQuery`/`useMutation`.
    *   Subtask: Verify functionality and cache invalidation.
*   [ ] Task: Migrate Group B Components to TanStack Query
    *   Subtask: Write tests for current behavior.
    *   Subtask: Replace `useEffect` fetch with `useQuery`/`useMutation`.
    *   Subtask: Verify functionality.
*   [ ] Task: Conductor - User Manual Verification 'Data Fetching Migration' (Protocol in workflow.md)

## Phase 4: Testing and Quality Assurance
*   [ ] Task: Increase Unit Test Coverage
    *   Identify areas with low coverage using `vitest --coverage`.
    *   Write unit tests for utility functions and hooks.
*   [ ] Task: Final Polish and Lint Fixes
    *   Run `bun format:fix` and `bun lint:fix`.
    *   Ensure all tests pass.
*   [ ] Task: Conductor - User Manual Verification 'Testing and Quality Assurance' (Protocol in workflow.md)
