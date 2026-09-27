# Teach satellite design

Teach follows the shared Learn and Teach guidance in `apps/learn/DESIGN.md` and the Tuturuuu platform shell. The authenticated workspace uses `structure.tsx` and `navigation.tsx` with `SidebarStructure`; the teacher theme and workspace controls should look like other satellite controls.

Teacher pages emphasize course groups, modules, attendance, assignments, reports, and metrics. Use compact page headers, subtle bordered cards, rounded controls, readable tables, and clear next actions. Avoid thick outlines, offset shadows, display-sized dashboard headlines, and decorative color blocks.

Keep course and schedule behavior intact. Attendance reads each course schedule from `workspace_user_groups` (`sessions`, `starting_date`, and `ending_date`). Reports can be previewed in Teach before save and handed off to Learn where appropriate. Central platform login and local token verification remain the authentication flow.
