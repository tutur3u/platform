import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  own: false,
  permission: true,
  from: vi.fn(),
}));
vi.mock('@tuturuuu/satellite/workspace-access', () => ({
  getSatelliteWorkspacePermissions: async () => ({
    containsPermission: () => state.permission,
    withoutPermission: () => !state.permission,
  }),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ from: state.from }),
}));
vi.mock('@/lib/resolve-route-workspace', () => ({
  resolveRouteWorkspace: async () => ({ resolvedWsId: 'workspace-a' }),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not-found');
  },
}));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock('@tuturuuu/icons', () => ({
  Box: () => null,
  Eye: () => null,
  Paperclip: () => null,
}));
vi.mock('@tuturuuu/ui/custom/education/modules/link-button', () => ({
  default: () => null,
}));
vi.mock('@tuturuuu/ui/custom/feature-summary', () => ({ default: () => null }));
vi.mock('@tuturuuu/ui/separator', () => ({ Separator: () => null }));
vi.mock('@/components/custom-data-table', () => ({
  CustomDataTable: () => null,
}));
vi.mock(
  '../app/[locale]/(dashboard)/[wsId]/education/quiz-sets/[setId]/columns',
  () => ({ getWorkspaceQuizColumns: vi.fn() })
);
vi.mock(
  '../app/[locale]/(dashboard)/[wsId]/education/quiz-sets/[setId]/form',
  () => ({ default: () => null })
);
vi.mock(
  '../app/[locale]/(dashboard)/[wsId]/education/quiz-sets/[setId]/linked-modules/columns',
  () => ({ getWorkspaceCourseModuleColumns: vi.fn() })
);
vi.mock(
  '../app/[locale]/(dashboard)/[wsId]/education/quiz-sets/[setId]/linked-modules/linker',
  () => ({ QuizsetModuleLinker: () => null })
);

import Layout from '../app/[locale]/(dashboard)/[wsId]/education/quiz-sets/[setId]/layout';
import Modules from '../app/[locale]/(dashboard)/[wsId]/education/quiz-sets/[setId]/linked-modules/page';
import Quizzes from '../app/[locale]/(dashboard)/[wsId]/education/quiz-sets/[setId]/page';

beforeEach(() => {
  state.own = false;
  state.permission = true;
  state.from.mockReset().mockImplementation((_table: string) => {
    const filters: Record<string, string> = {};
    const query = {
      select: () => query,
      eq: (key: string, value: string) => {
        filters[key] = value;
        return query;
      },
      order: () => query,
      range: () => query,
      limit: () => query,
      maybeSingle: async () => ({
        data: filters.ws_id && !state.own ? null : { id: 'set', name: 'set' },
        error: null,
      }),
      // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are awaitable.
      then: (resolve: (value: unknown) => void) =>
        resolve({ data: [], count: 0, error: null }),
    };
    return query;
  });
});
const props = () => ({
  params: Promise.resolve({ locale: 'en', wsId: 'workspace-a', setId: 'set' }),
  searchParams: Promise.resolve({}),
  children: null,
});
for (const [name, page] of [
  ['layout', Layout],
  ['quizzes', Quizzes],
  ['modules', Modules],
] as const) {
  it(`denies a foreign set in the ${name} segment`, async () => {
    await expect(page(props())).rejects.toThrow('not-found');
    expect(state.from).not.toHaveBeenCalledWith('quiz_set_quizzes');
    expect(state.from).not.toHaveBeenCalledWith('course_module_quiz_sets');
  });
  it(`checks education permission in the ${name} segment`, async () => {
    state.own = true;
    state.permission = false;
    await expect(page(props())).rejects.toThrow('not-found');
    expect(state.from).not.toHaveBeenCalled();
  });
  it(`preserves an owned set in the ${name} segment`, async () => {
    state.own = true;
    await expect(page(props())).resolves.toBeTruthy();
  });
}
