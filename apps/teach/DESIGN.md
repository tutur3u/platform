# Teach Design System

Teach follows the shared Tuturuuu Education Satellites design language defined in
`apps/learn/DESIGN.md`.

## Visual Mode

- Use Neobrutalism for every Teach surface: hard 2px foreground borders, offset
  shadows, visible grid logic, loud type, and functional color blocks.
- Keep Teach complementary to Learn:
  - Teach is planner/operator energy: yellow, green, blue, and orange blocks.
  - Learn is learner momentum: playful progress, checkpoint cards, and activity
    rails.
- Do not use soft SaaS gradients, glass cards, pill-heavy chrome, or generic
  marketing-page hero compositions.

## Authentication

- Teach has no local login portal.
- `/login` redirects to Tuturuuu platform login in `apps/web`.
- `/verify-token` consumes the cross-app token issued after platform account
  confirmation.

## Relationship To Apps

- `apps/web` owns platform login, protected APIs, app-session verification,
  workspace permissions, and the central data model.
- `apps/teach` owns the teacher UI for core education operations: course
  creation, course publishing, existing-user enrollment, module authoring,
  schedule-aware attendance, posts, report previewing, and metrics.
- `apps/learn` presents the learner/parent-facing companion surface.
- Teach should not link core teacher actions back to `apps/web`. Keep external
  handoffs intentional, such as learner preview into `apps/learn` and
  centralized auth/logout.

## Teacher Tools

- Attendance must use the course schedule stored on `workspace_user_groups`
  (`sessions`, `starting_date`, and `ending_date`) as the source of truth.
  Calendar cells should distinguish unscheduled days, scheduled-but-unchecked
  days, partial attendance, complete attendance, late arrivals, and absences.
- Reports should be previewed in Teach before save with the same learner,
  course, score, feedback, and metric context that learners will later see in
  Learn.
- Assignment/post and metric tools should include intentional Learn handoffs
  for previewing the learner-facing course, assignments, reports, or marks.
