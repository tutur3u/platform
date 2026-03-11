# Mobile Board Detail Port Plan
## Goal
Port the web `boardId` view to mobile with a mobile-native UX that preserves the core workflow while avoiding a costly 1:1 rebuild of the web implementation.
## Agreed Scope
### Included in initial direction
- Kanban view
- List view
- Read + basic edit
- Bottom sheet task detail/edit flow
- Most web filters
- Basic board actions
- Current-board-only task moves
- Side-by-side kanban on tablet
- Balanced rollout: MVP first, with a clean path toward broader parity

## Implementation Progress (2026-03-11)
### Completed in this session
- Added board detail routing:
  - `Routes.taskBoardDetail = '/tasks/boards/:boardId'`
  - `Routes.taskBoardDetailPath(String boardId)`
  - `GoRouter` route wiring in `app_router.dart` with safe fallback to `TaskBoardsPage`
- Wired board-card navigation from boards index to board detail route.
- Added board-detail models:
  - `TaskBoardDetail`
  - `TaskBoardList`
  - `TaskBoardTask` (+ assignee model)
- Extended `TaskRepository` with board-detail-focused methods:
  - `getTaskBoardDetail(wsId, boardId)`
  - `getBoardTasks(wsId, boardId)`
  - `getBoardLists(boardId)`
  - `createBoardTask(...)`
  - `updateBoardTask(...)`
  - `moveBoardTask(...)`
  - `createBoardList(...)`
  - `renameBoardList(...)`
- Added dedicated board detail state layer:
  - `TaskBoardDetailCubit`
  - `TaskBoardDetailState`
  - stale async request token guard
- Added initial board detail UI scaffolding with split view files:
  - page shell + app bar + refresh
  - list/kanban view toggle
  - search filter
  - grouped task rendering by list
  - basic task preview bottom sheet (read-only preview)
- Added new mobile localization keys in both ARB files for board detail UI.

### Current status vs phases
- Phase 1 (Foundation): **mostly done**
  - [x] route
  - [x] page shell
  - [x] models
  - [x] repository hydration methods
  - [x] dedicated cubit/state
  - [x] boards index -> board detail navigation
- Phase 2 (Core Views): **started**
  - [x] list view (initial)
  - [x] kanban view (initial read-only)
  - [ ] tablet side-by-side kanban refinement
  - [ ] richer parity behavior between list/kanban interactions
- Phase 3+ : **not started** (except read-only task preview shell)

### Notes for the next agent
- Board detail hydration currently composes data from:
  - `/api/v1/workspaces/{wsId}/task-boards` (metadata)
  - `/api/v1/workspaces/{wsId}/tasks?boardId=...` (tasks)
  - Supabase `task_lists` query (lists)
  - existing repository calls for labels/members/projects
- `TaskBoardDetailView` is read-first; editing/mutation UI is not wired yet.
- Existing task preview is a lightweight bottom sheet placeholder, not full edit flow.
- Suggested next step: implement Phase 3 bottom-sheet edit flow on top of existing `TaskBoardDetailCubit` + `TaskRepository` mutation methods.

### Explicitly deferred
- Timeline view
- Cross-board task moves
- Full board management parity
- Full list management parity
- Realtime sync in initial launch
## Current State
### Web
The web board detail experience is centered around:
- `packages/ui/src/components/ui/tu-do/shared/board-client.tsx`
- `packages/ui/src/components/ui/tu-do/shared/board-views.tsx`
- `packages/ui/src/components/ui/tu-do/boards/boardId/kanban.tsx`
- `packages/ui/src/components/ui/tu-do/boards/boardId/task-list.tsx`
- `packages/ui/src/components/ui/tu-do/boards/boardId/timeline-board.tsx`
The web implementation includes:
- Multiple view modes
- Progressive board loading
- Large filter surface
- Task dialogs and menus
- Bulk actions
- Realtime sync
- Recycle bin support
### Mobile
Mobile currently has:
- Boards index page in `apps/mobile/lib/features/tasks_boards/view/task_boards_view.dart`
- Boards list cubit in `apps/mobile/lib/features/tasks_boards/cubit/task_boards_cubit.dart`
- No board detail route
- No board detail page
- No task detail page
- No board-detail-focused models or state layer
- A thin task model in `apps/mobile/lib/data/models/task.dart`
## Recommended Strategy
Do not port the web implementation literally.
Instead:
- Rebuild the feature natively in Flutter
- Reuse backend contracts where possible
- Reuse mobile page/cubit patterns already used elsewhere
- Keep one canonical board-detail state on mobile
- Add features in phases so core task workflows stabilize before advanced interactions
## Deliverables
### Phase 1: Foundation
- Add a board detail route
- Add a board detail page shell
- Add board-detail data models
- Add repository methods for board detail hydration
- Add a dedicated board detail cubit and state
- Wire board-card navigation from the boards index page
### Phase 2: Core Views
- Build list view first
- Build kanban view second
- Add responsive tablet layout with side-by-side columns
- Keep both views backed by the same task/list state
### Phase 3: Task Interaction
- Bottom sheet task detail
- Basic task editing:
  - title
  - dates
  - priority
  - assignees
  - labels
  - projects
- Create task inside a selected list
- Move task between lists in the current board
### Phase 4: Board/List Controls
- Basic board actions
- Create list
- Rename list
- Refresh/reload flow
- Filter/search UI
### Phase 5: Interaction Upgrades
- Add drag/drop within the board after menu-based move is stable
- Improve empty states, errors, and loading transitions
- Add polish for tablet UX
### Phase 6: Deferred Follow-up
- Realtime sync
- Recycle bin support
- Cross-board moves
- Timeline
- Full board/list management parity
## Proposed File Structure
### Routing
- `apps/mobile/lib/core/router/routes.dart`
- `apps/mobile/lib/core/router/app_router.dart`
### New page files
- `apps/mobile/lib/features/tasks_boards/view/task_board_detail_page.dart`
- `apps/mobile/lib/features/tasks_boards/view/task_board_detail_page_view.dart`
- `apps/mobile/lib/features/tasks_boards/view/task_board_detail_page_cards.dart`
- `apps/mobile/lib/features/tasks_boards/view/task_board_detail_page_states.dart`
- `apps/mobile/lib/features/tasks_boards/view/task_board_detail_page_utils.dart`
### New cubit files
- `apps/mobile/lib/features/tasks_boards/cubit/task_board_detail_cubit.dart`
- `apps/mobile/lib/features/tasks_boards/cubit/task_board_detail_state.dart`
### New/expanded models
- `apps/mobile/lib/data/models/task_board_detail.dart`
- `apps/mobile/lib/data/models/task_board_list.dart`
- `apps/mobile/lib/data/models/task_board_task.dart`
### Existing files to extend
- `apps/mobile/lib/features/tasks_boards/view/task_boards_view.dart`
- `apps/mobile/lib/data/repositories/task_repository.dart`
- `apps/mobile/lib/l10n/arb/app_en.arb`
- `apps/mobile/lib/l10n/arb/app_vi.arb`
## Routing Plan
Add a new route for board detail.
### Needed additions
- `Routes.taskBoardDetail = '/tasks/boards/:boardId'`
- A path helper like `taskBoardDetailPath(String boardId)`
### Router behavior
- Extract `boardId` from path params
- Fallback back to boards index if missing
- Navigate from the boards list when a board card is tapped
## Data Model Plan
## Problem
Current `Task` in mobile is too thin for board detail use cases.
## Needed mobile board-detail model
A richer board payload should include:
- board metadata
- lists
- tasks
- task relations needed for cards and filters
- supporting resources:
  - labels
  - members
  - projects
## Suggested model split
- `TaskBoardDetail`
  - `id`
  - `name`
  - `icon`
  - `wsId`
  - board metadata needed by header/actions
- `TaskBoardList`
  - `id`
  - `name`
  - `status`
  - `position`
  - list-level metadata
- `TaskBoardTask`
  - id
  - title
  - description
  - listId
  - priority
  - dates
  - assignees
  - labels
  - projects
  - archived/deleted flags where relevant
## Repository Plan
Extend `apps/mobile/lib/data/repositories/task_repository.dart` with board-detail-specific methods.
### Minimum required methods
- `getTaskBoardDetail(wsId, boardId)`
- `getBoardTasks(wsId, boardId)`
- `getBoardLists(boardId)`
- `createBoardTask(...)`
- `updateBoardTask(...)`
- `moveBoardTask(...)`
- `createBoardList(...)`
- `renameBoardList(...)`
### Preferred hydration approach
Use a mobile-friendly data composition strategy:
- fetch board
- fetch lists
- fetch board tasks
- fetch supporting resources for filters/edit UI
If the existing APIs are awkward for this, add a dedicated mobile-friendly board detail API later.
## State Management Plan
Create `TaskBoardDetailCubit` using the same safe async patterns already used in mobile.
### State should include
- `workspaceId`
- `boardId`
- `status`
- `error`
- `board`
- `lists`
- `tasks`
- `currentView`
- `filters`
- `searchQuery`
- `selectedTaskId`
- `isMutating`
- request token/version guard for stale async responses
### Key principles
- One canonical board-detail state
- Derived filtered/grouped data in selectors/helpers
- Workspace-scoped async protection
- Reload on workspace change
- Avoid per-widget data ownership
## View Plan
## List View
Build first because it is lower risk.
### Capabilities
- Show all board tasks
- Group by list or show filtered result set
- Open task bottom sheet
- Create task
- Move task via action sheet
- Apply filters/search
## Kanban View
Build second using the same data.
### Capabilities
- Horizontal list columns
- Compact task cards
- Side-by-side tablet layout
- Action-sheet move first
- Drag/drop later
## Task Detail Plan
Use a bottom sheet for the initial mobile flow.
### Included fields
- Title
- Dates
- Priority
- Assignees
- Labels
- Projects
### Included actions
- Save edits
- Move to another list in current board
- Delete if already supported safely by current mobile patterns
### Deferred
- Dedicated routed task detail page
- Advanced relation management parity
- Full desktop-style inline actions
## Filter Plan
Bring over most web filters, but expressed in a mobile-friendly way.
### Initial filter surface
- Search
- List/status filter
- Labels
- Assignees
- Projects
- Priority
- Date range if clean enough in the first pass
### UX recommendation
Use a filter bottom sheet rather than inline dense controls.
## Board Action Plan
Initial board-level actions:
- Refresh
- Rename board
- Create task
- Create list
Deferred:
- Duplicate board
- Archive/restore/delete parity
- Recycle bin
- Full settings parity
## List Management Plan
Initial list management:
- Create list
- Rename list
Deferred:
- Delete list
- Reorder lists
- Archive list
- Full list settings parity
## Drag/Drop Plan
Because mobile drag/drop is one of the highest-risk pieces, stage it separately.
### Step 1
- Action sheet move between lists
- Stable and easy to validate
### Step 2
- Add touch drag/drop inside the board
- Keep it current-board-only
- Only after base kanban behavior is solid
## Realtime Plan
Realtime is phase 2.
### Initial release
- Manual refresh
- Reload after mutations
- Stable local state first
### Follow-up
- Add Supabase broadcast or equivalent mobile subscription
- Reconcile external updates into cubit state
## Localization Plan
All new user-facing strings must be added to:
- `apps/mobile/lib/l10n/arb/app_en.arb`
- `apps/mobile/lib/l10n/arb/app_vi.arb`
Likely new string groups:
- board detail title/actions
- view switcher labels
- filters
- create/rename list
- task bottom sheet labels
- move task actions
- empty states
- loading/error states
## Implementation Order
1. Add route and navigation wiring
2. Create board-detail page shell
3. Add board-detail models
4. Add repository methods
5. Add board-detail cubit/state
6. Implement list view
7. Implement bottom-sheet task detail/edit
8. Add create task and simple move flow
9. Add basic board actions
10. Add create/rename list
11. Implement kanban view
12. Add filters/search
13. Add drag/drop
14. Add realtime in phase 2
## Risks
### High risk
- Drag/drop on mobile
- Trying to mirror web architecture too literally
- Underestimating model expansion needed for assignees/labels/projects
### Medium risk
- Slow first paint if board hydration requires too many calls
- Filter complexity growing beyond mobile-friendly UX
- Mutation consistency between list and kanban views
### Low risk
- Routing additions
- Page shell creation
- Basic bottom-sheet editing
- Create/rename list
## Success Criteria
Phase 1 is successful when a user can:
- open a board from the boards list
- switch between kanban and list view
- inspect board tasks
- search/filter tasks
- open a task in a bottom sheet
- edit the agreed basic fields
- create a task
- move a task to another list in the same board
- create and rename lists
- use the board comfortably on phone and tablet
## Out of Scope for Initial Delivery
- Timeline
- Cross-board moves
- Full recycle bin parity
- Full board settings parity
- Full bulk actions parity
- Full realtime parity
- Dedicated task detail route
