Proposed rollout plan
1) Stabilize API contract first (so UI can migrate safely)
- Add new workspace endpoints under apps/web/src/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/module-groups/*:
  - GET/POST /module-groups
  - PUT/DELETE /module-groups/[moduleGroupId]
  - PATCH /module-groups/order (calls reorder_workspace_course_module_groups)
- Add module-in-group reorder endpoint:
  - PATCH /module-groups/[moduleGroupId]/module-order (calls reorder_workspace_course_modules_in_module_group)
- Extend existing modules endpoints:
  - GET /user-groups/[groupId]/modules should return modules ordered by module_group_id, then sort_key
  - POST /user-groups/[groupId]/modules must accept module_group_id
  - PUT /course-modules/[moduleId] must accept module_group_id changes
- Keep legacy route behavior compatible:
  - existing /user-groups/[groupId]/module-order can stay (using upgraded legacy RPC), but mark as deprecated in code comments and internal-api naming.
2) Update shared internal API helpers (single source for client calls)
- In packages/internal-api/src/education.ts:
  - Add typed CRUD helpers for module groups.
  - Add reorder helper for module groups.
  - Add reorder helper for modules within module group.
  - Update createWorkspaceCourseModule payload to include required module_group_id.
  - Keep existing reorderWorkspaceCourseModules(...) as compatibility wrapper, but prefer new helper names.
- Export new helpers from packages/internal-api/src/index.ts.
3) Migrate builder data loading to client-side fetching/rendering with React Query
- In builder pages:
  - apps/web/src/app/[locale]/(dashboard)/[wsId]/education/courses/[courseId]/builder/page.tsx
  - apps/web/src/app/[locale]/(dashboard)/[wsId]/users/groups/[groupId]/content/page.tsx
- Keep the route pages as thin auth/permission gates and move the data work into a client shell.
- Fetch:
  - module groups (workspace_course_module_groups) ordered by sort_key
  - modules (workspace_course_modules) ordered by module_group_id, sort_key
- Build a grouped view model in the client layer for rendering (group + modules[]).
- Use React Query for loading, cache updates, optimistic reordering, and refetch/invalidation flows.
4) Refactor builder UI to grouped drag-and-drop
- In course-builder-client.tsx:
  - Replace flat module list with:
    - sortable module-group list
    - sortable module list within each group
  - Add create/edit/delete group actions (title/icon/color).
  - Move module create action into a selected group context.
  - Support moving module across groups (updates module_group_id + reorder in destination group).
- Update forms:
  - packages/ui/.../course-module-form.tsx
  - apps/web/.../quiz-sets/[setId]/linked-modules/form.tsx
  - Ensure module creation always passes module_group_id.
5) Enforce color UX + validation parity
- UI for group color should enforce exactly #rrggbb:
  - input pattern + client zod regex
  - normalized lowercase before submit (optional but recommended for consistency)
- Keep DB as source of truth (already enforced), but fail fast client-side for better UX.
6) Type updates in app-level domain types
- Extend WorkspaceCourseBuilderModule usage to include module_group_id where needed.
- Add a new app type for builder module group row (from workspace_course_module_groups) to avoid ad-hoc shapes.
7) Tests and regression coverage
- API route tests:
  - add new tests for module-group CRUD + reorder
  - update existing module-order tests for compatibility expectations
- UI tests:
  - grouped render state
  - create module in group
  - reorder group + reorder module-in-group
  - move module between groups
- Keep existing module-detail routes working (.../modules/[moduleId]/*) with no URL changes.
8) Optional cleanup phase (after migration is stable)
- Deprecate old /courses/[courseId]/modules and /courses/[courseId]/module-order API paths if no longer used.
- Keep compatibility wrappers for one release cycle, then remove.
---
High-risk spots to handle explicitly
- New module creation now requires module_group_id (current create flows will fail without this).
- Drag reorder payloads must remain full-list and unique per target scope.
- Cross-group moves must update both module_group_id and position atomically from UI perspective (optimistic state + rollback on error).
---
Recommended implementation order
1. API routes + internal-api helpers  
2. Builder loaders + grouped view model  
3. Builder UI grouped interactions  
4. Form updates + linked-modules flow  
5. Tests + cleanup/deprecation comments
