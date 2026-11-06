import { expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock('@tuturuuu/education-core/education/access', () => ({
  EDUCATION_ATTEMPTS_WORKSPACE_PERMISSION: 'view_user_groups_reports',
}));
vi.mock('@tuturuuu/satellite/workspace-access', () => ({
  getSatelliteWorkspacePermissions: async () => ({
    withoutPermission: () => true,
  }),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: state.admin,
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
  ArrowLeft: () => null,
  CircleCheck: () => null,
  CircleX: () => null,
}));
vi.mock('@tuturuuu/ui/badge', () => ({ Badge: () => null }));
vi.mock('@tuturuuu/ui/button', () => ({ Button: () => null }));
vi.mock('@tuturuuu/ui/card', () => ({
  Card: () => null,
  CardContent: () => null,
  CardHeader: () => null,
  CardTitle: () => null,
}));
vi.mock(
  '@tuturuuu/ui/custom/education/shell/education-content-surface',
  () => ({ EducationContentSurface: () => null })
);
vi.mock('@tuturuuu/ui/custom/education/shell/education-kpi-strip', () => ({
  EducationKpiStrip: () => null,
}));
vi.mock('@tuturuuu/ui/custom/education/shell/education-page-header', () => ({
  EducationPageHeader: () => null,
}));

import Page from '../app/[locale]/(dashboard)/[wsId]/education/attempts/[attemptId]/page';

it('denies attempt detail without report permission before reading learner data', async () => {
  state.admin.mockRejectedValue(new Error('sensitive read'));
  await expect(
    Page({
      params: Promise.resolve({ wsId: 'workspace-a', attemptId: 'attempt' }),
    })
  ).rejects.toThrow('not-found');
  expect(state.admin).not.toHaveBeenCalled();
});
