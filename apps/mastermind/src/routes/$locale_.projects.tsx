import { createFileRoute, notFound } from '@tanstack/react-router';
import { z } from 'zod';
import { I18nProvider, isLocale } from '../i18n';
import { threadStates } from '../projects/contract';
import { ProjectsPage } from '../projects/projects-page';

const search = z.object({
  /** A linked machine's environment id; absent means this machine. */
  machine: z.string().max(200).optional().catch(undefined),
  thread: z.string().max(400).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
  state: z.enum(threadStates).optional().catch(undefined),
});
export type ProjectsSearch = z.infer<typeof search>;

// Outside the `$locale` layout, so the command center loader never runs here.
// The Worker keeps this page and its server functions owner-only.
export const Route = createFileRoute('/$locale_/projects')({
  beforeLoad: ({ params }) => {
    if (!isLocale(params.locale)) throw notFound();
  },
  validateSearch: search,
  component: ProjectsRoute,
});

function ProjectsRoute() {
  const { locale } = Route.useParams();
  const value = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <I18nProvider locale={isLocale(locale) ? locale : 'en'}>
      <ProjectsPage
        search={value}
        onSearch={(next, replace = true) =>
          navigate({
            search: (prev) => ({ ...prev, ...next }),
            replace,
          })
        }
      />
    </I18nProvider>
  );
}
