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

- `apps/web` owns platform login, protected APIs, workspace controls, and
  teacher/admin operations.
- `apps/teach` presents the education command surface for teachers.
- `apps/learn` presents the learner/parent-facing companion surface.
