# Mobile Board Detail Port Plan (Consolidated)

## Goal
Ship a mobile-native `boardId` experience that preserves core board workflows (list + kanban, task edit/create/move, filtering, basic board/list controls) without a 1:1 web rebuild.

## Scope Snapshot

### In scope for initial delivery
- List view + Kanban view
- Read and basic edit in task sheet
- Task create and current-board list-to-list move
- Search + advanced filters
- Basic board/list actions

### Explicitly deferred
- Timeline view
- Cross-board task moves
- Full board/list management parity
- Realtime sync
- Recycle bin and bulk-action parity
- Dedicated routed task-detail page

## Implementation Status (as of 2026-03-11)

### Implemented

#### Routing and navigation
- Board detail route added: `Routes.taskBoardDetail = '/tasks/boards/:boardId'`
- Route helper added: `Routes.taskBoardDetailPath(String boardId)`
- Router wired in `app_router.dart` with safe fallback to `TaskBoardsPage`
- Board cards now navigate from board index to board detail

#### Data and repository
- Board detail models added:
  - `TaskBoardDetail`
  - `TaskBoardList`
  - `TaskBoardTask` (including assignees, labels, projects, estimation)
- Repository board-detail hydration implemented:
  - `getTaskBoardDetail(wsId, boardId)`
  - `getBoardTasks(wsId, boardId)`
  - `getBoardLists(wsId, boardId)`
- Repository board mutations implemented:
  - `createBoardTask(...)`
  - `updateBoardTask(...)`
  - `moveBoardTask(...)`
  - `createBoardList(...)`
  - `renameBoardList(...)`
  - existing `updateTaskBoard(...)` used for board rename

#### State management
- Dedicated board state layer added:
  - `TaskBoardDetailCubit`
  - `TaskBoardDetailState`
- Workspace/board stale async protection present (request token guard)
- Mutation flow implemented with:
  - `isMutating`
  - `mutationError`
  - serialized mutation guard
  - reload-after-success strategy for consistency

#### UI and interaction
- Board detail page scaffolded with split part files
- List/Kanban view switch implemented
- Search implemented
- Grouped task rendering by list implemented
- Task detail/edit sheet implemented with save + validation + API error surfacing:
  - title
  - description
  - priority
  - start/end dates
  - estimation points
  - assignees multi-select
  - labels multi-select
  - projects multi-select
- Task create flows implemented from list, kanban, and FAB
- Task move flow implemented (current board only)
- Board/list controls implemented:
  - board rename + refresh
  - create list
  - list rename (list and kanban headers)
- No-lists state includes create-list CTA

#### Filters and localization
- Advanced filter sheet implemented with cubit-backed state:
  - list
  - status
  - priority
  - assignee
  - labels
  - projects
- Unified search + advanced filter matching via derived state selectors
- User-facing strings added for board detail in both:
  - `app_en.arb`
  - `app_vi.arb`

## Still Not Implemented

### High-priority follow-up
- Tablet kanban UX refinement (column density/sizing and compact empty states)
- Focused board-detail tests:
  - cubit mutation coverage
  - filter transition coverage
  - core widget flows (view switch, create/edit/move)

### Planned after stabilization
- Drag-and-drop task movement in board view
- Realtime board sync/subscription flow

## Phase Status

- Phase 1 (Foundation): **Done**
- Phase 2 (Core Views): **Done (baseline), refinement pending for tablet UX**
- Phase 3 (Task Interaction): **Done (MVP+)**
- Phase 4 (Board/List Controls + Filters): **Done (MVP+)**
- Phase 5 (Interaction Upgrades): **Not started**
- Phase 6 (Deferred Follow-up): **Deferred by design**

## Current Mobile Data Composition
Board detail hydration currently composes data from:
- `/api/v1/workspaces/{wsId}/task-boards` (board metadata fallback)
- `/api/v1/workspaces/{wsId}/task-boards/{boardId}` (direct board metadata when needed)
- `/api/v1/workspaces/{wsId}/task-boards/{boardId}/lists` (lists)
- `/api/v1/workspaces/{wsId}/tasks?boardId=...` (tasks)
- Existing repository calls for labels, members, projects, and estimate settings

## Recommended Next Slice
1. Refine tablet kanban ergonomics (column sizing, spacing, compact empty states).
2. Add targeted cubit + widget tests for board detail interactions.
3. Revisit drag/drop only after tests lock in baseline behavior.
