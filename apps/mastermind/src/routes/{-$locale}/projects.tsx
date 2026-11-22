import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { threadStates } from '../../projects/contract';
import { ProjectsPage } from '../../projects/projects-page';

const search = z.object({
  /** A linked machine's environment id; absent means this machine. */
  machine: z.string().max(200).optional().catch(undefined),
  thread: z.string().max(400).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
  state: z.enum(threadStates).optional().catch(undefined),
});
export type ProjectsSearch = z.infer<typeof search>;

// The Worker keeps this page and its server functions owner-only.
export const Route = createFileRoute('/{-$locale}/projects')({
  validateSearch: search,
  component: ProjectsRoute,
});

function ProjectsRoute() {
  const value = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <ProjectsPage
      search={value}
      onSearch={(next, replace = true) =>
        navigate({
          search: (prev) => ({ ...prev, ...next }),
          replace,
        })
      }
    />
  );
}
