import { ProgrammingError } from '@tuturuuu/education-core/education/programming-model';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
}));
vi.mock('@/lib/programming/server', () => ({
  programmingLearnerScope: async () => ({
    subject: { wsId: 'workspace', studentPlatformUserId: 'learner' },
  }),
  programmingApiOptions: async () => ({}),
}));
vi.mock('@/lib/coding/store', () => ({
  readCodingSubmission: mocks.read,
  listCodingExecutions: mocks.list,
  notifyProgrammingSubmission: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/education', () => ({
  getProgrammingProblem: mocks.get,
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock('@/i18n/navigation', () => ({ redirect: vi.fn() }));

import { getProgrammingSubmission, listProgrammingExecutions } from './actions';
import { programmingPageFailure } from './page-feedback';

it('reports malformed action identifiers as400 before requesting a catalog or history', async () => {
  await expect(
    listProgrammingExecutions('workspace', undefined, 'invalid')
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    getProgrammingSubmission(
      'workspace',
      undefined,
      '11111111-1111-4111-8111-111111111111',
      'invalid'
    )
  ).rejects.toMatchObject({ status: 400 });
  expect(mocks.get).not.toHaveBeenCalled();
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.list).not.toHaveBeenCalled();
});
it('renders invalid request feedback separately from authorization denial', async () => {
  const invalid = renderToStaticMarkup(
    await programmingPageFailure(
      new ProgrammingError('Invalid', 400),
      'en',
      'workspace'
    )
  );
  expect(invalid).toContain('invalidRequestDescription');
  expect(invalid).not.toContain('accessDenied');
  const denied = renderToStaticMarkup(
    await programmingPageFailure(
      new ProgrammingError('Denied', 403),
      'en',
      'workspace'
    )
  );
  expect(denied).toContain('accessDeniedDescription');
  expect(denied).not.toContain('invalidRequest');
});
