# Tutoring / Remedial Workflow Implementation Plan

## Goal

Implement the tutoring/remedial workflow from the requirement sheet while reusing as much existing platform capability as possible (attendance, user groups, exports, parent links, feedbacks, permissions).

## Existing Assets To Reuse

- Attendance source of truth: `user_group_attendance` and group attendance APIs.
- Group schedule dates: `workspace_user_groups.sessions` and group schedule calendar UI.
- Export pipeline: attendance export endpoint + XLSX/CSV client export flow.
- Parent relationship model: `tulearn_parent_student_links` + invite flow.
- Staff follow-up messaging flow: existing follow-up compose/send pattern.
- Attention signals: `user_feedbacks` (`require_attention`, `content`, `group_id`, `user_id`).

## Core Product Scope

1. Build a date/time-slot tutoring schedule surface for staff + manager.
2. Add a pending queue that merges:
   - `Absent` from absence/makeup deficits.
   - `Weak Support` from `user_feedbacks.require_attention = true`.
3. Support attendance marking per tutoring session (`pending/done/no_show/cancelled`).
4. Generate parent-facing message text (copy-ready for Zalo workflow).
5. Export detailed and payroll-ready monthly reports.

## Data Model Plan

Create an additive table (name can be finalized during migration review), e.g. `workspace_tutoring_sessions`:

- `id uuid pk`
- `ws_id uuid not null`
- `group_id uuid not null`
- `student_user_id uuid not null`
- `teacher_user_id uuid null`
- `session_date date not null`
- `start_time time not null`
- `duration_minutes int not null default 45`
- `reason_type text not null` (`ABSENT_RECOVERY | WEAK_SUPPORT | CUSTOM`)
- `reason_detail text not null default ''`
- `content text not null default ''`
- `attendance_status text not null` (`PENDING | DONE | NO_SHOW | CANCELLED`)
- `parent_message_preview text not null default ''`
- `source_feedback_id uuid null` (optional link to `user_feedbacks.id`)
- `resolved_at timestamptz null`
- `created_by uuid null`, `created_at timestamptz`, `updated_at timestamptz`

Optional config keys (workspace-scoped):

- recovery rules (how many makeup sessions required).
- stale content warning window (default 14 days).
- default session duration (45).

## Candidate Queue Logic

Build a candidate query/service returning pending tutoring candidates by workspace/date range.

### Candidate Sources

- **ABSENT_RECOVERY**: student has absence deficit from `user_group_attendance`.
- **WEAK_SUPPORT**: latest `user_feedbacks` for student/group has `require_attention = true`.
- If both apply, expose combined label/priority.

### Queue Actions

- Activate to schedule tutoring.
- Mark as not needed.
- Remove from queue.

### Closure Rules

- `ABSENT_RECOVERY`: close when completed makeup session count reaches required deficit.
- `WEAK_SUPPORT`: close by explicit staff action or policy-based auto-close (decision needed).

## API Plan

Add workspace-scoped routes under `apps/web/src/app/api/v1/workspaces/[wsId]/tutoring/*`:

- `GET /queue`: derived pending candidates with filters (`date`, `teacher`, `group`, `reasonType`).
- `POST /sessions`: create tutoring session.
- `GET /sessions`: list sessions by date range.
- `PUT /sessions/[id]`: update content/status/teacher/time.
- `POST /sessions/[id]/mark`: attendance status transition helper.
- `POST /sessions/[id]/message-preview`: generate parent-ready message text.
- `GET /export`: paginated export payload for detailed + payroll views.

Use existing permission style and add/extend permission keys if needed.

## UI Plan

Add a tutoring surface in dashboard users domain:

- Main table columns aligned to requirement sheet:
  - STT
  - Time slots
  - Teacher in charge
  - Student Name
  - Group/Class
  - Content
  - attendance status
  - Date
  - Template Text
- Secondary tab: `Pending` queue.
- Filters: date, teacher, class/group, reason type, status.
- Teacher view only sees assigned sessions; manager/staff can see all.

## Parent Message Strategy

Template placeholders:

- student name
- class/group
- reason label (`Absent` / `Weak Support`)
- time slot
- date
- teacher name

Support copy action and optional export batch for daily staff workflow.

## Export Plan

Reuse attendance export pattern:

- paginated backend retrieval
- client XLSX/CSV generation
- date-range quick presets

Provide two export modes:

1. **Detailed sessions** (operational/audit)
2. **Teacher payroll summary** (monthly totals by teacher, completed sessions only)

## Integration With `user_feedbacks`

Treat `user_feedbacks.require_attention` as a first-class source for `Weak Support`.

- Use feedback `content` as queue rationale/context preview.
- Keep `source_feedback_id` on tutoring session (optional but recommended) for traceability.
- Ensure unresolved attention feedback can be surfaced prominently to managers.

## Delivery Phases

1. **Phase 1**: migration + minimal CRUD/list APIs for tutoring sessions.
2. **Phase 2**: queue derivation service (attendance + feedback attention).
3. **Phase 3**: UI for schedule table + pending queue tab.
4. **Phase 4**: parent message generation/copy flow.
5. **Phase 5**: detailed + payroll exports.
6. **Phase 6**: warning rules (stale content, long-pending candidates).

## Implementation Snapshot (May 2026)

The following foundation has been implemented:

- **DB**
  - `workspace_tutoring_sessions` migration created and applied.
- **API routes** (`apps/web/src/app/api/v1/workspaces/[wsId]/tutoring/*`)
  - `GET/POST /sessions`
  - `PUT /sessions/[id]`
  - `POST /sessions/[id]/mark`
  - `POST /sessions/[id]/message-preview`
  - `GET /queue`
  - `GET /export`
- **Internal API client**
  - Added `packages/internal-api/src/tutoring.ts` and exported from `packages/internal-api/src/index.ts`.
- **Dashboard UI**
  - Added users-domain tutoring page at `apps/web/src/app/[locale]/(dashboard)/[wsId]/users/tutoring`.
  - Added a schedule tab and pending queue tab with status-marking controls.
  - Migrated schedule + pending tabs to client-rendered DataTable surfaces with client-side fetches through `@tuturuuu/internal-api` and URL filter state via `nuqs` (matching the users/groups and users/database interaction model).
  - Tutoring DataTable surfaces now use root/common translation scope for shared table labels (`refresh`, `view options`, pagination strings) while keeping `ws-tutoring` keys for tutoring-specific copy.
- **Navigation + i18n**
  - Added Users -> Tutoring navigation entry.
  - Added translation keys in both `apps/web/messages/en.json` and `apps/web/messages/vi.json`.

### Current Limitations / Next Iterations

- Current create form uses raw IDs for group/student (intentionally minimal bootstrap).
- Queue derivation currently computes deficit as `absent_count - done_absent_recovery_count`; configurable recovery rules are not wired yet.
- Parent message preview currently uses a fixed template and does not yet support workspace-level template customization.

## Open Decisions

1. Should `WEAK_SUPPORT` candidates auto-create pending sessions or only suggestions?
   - Recommended: suggestion-only queue + manual activation.
2. Should turning off `require_attention` auto-close related pending queue items?
3. Payroll formula: count per session, duration-weighted, or configurable rate table?
