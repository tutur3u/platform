import { describe, expect, it, vi } from 'vitest';
import { listEducationTodo } from './education-todo';

const state = vi.hoisted(() => ({ json: vi.fn() }));
vi.mock('./client', () => ({
  encodePathSegment: encodeURIComponent,
  getInternalApiClient: () => ({ json: state.json }),
  withLearnApiBaseUrl: (options: unknown) => options,
  withTeachApiBaseUrl: (options: unknown) => options,
}));
describe('education to do transport', () => {
  it.each(['learn', 'teach'] as const)(
    'uses %s owned route and never forwards another subject',
    (app) => {
      listEducationTodo(app, 'workspace/alias', { kind: 'tutoring', page: 2 });
      expect(state.json).toHaveBeenLastCalledWith(
        `/api/v1/workspaces/workspace%2Falias/${app === 'learn' ? 'tulearn' : 'teach'}/todo`,
        { cache: 'no-store', query: { kind: 'tutoring', page: 2 } }
      );
    }
  );
});
