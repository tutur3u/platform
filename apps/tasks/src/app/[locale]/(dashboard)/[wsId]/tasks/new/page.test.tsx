import { beforeEach, expect, it, vi } from 'vitest';
import Page from './page';

const { session, workspace } = vi.hoisted(() => ({
  session: vi.fn(),
  workspace: vi.fn(),
}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: session,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspace: workspace,
}));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not-found');
  },
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock('@/components/task-plan-composer', () => ({
  TaskPlanComposer: () => null,
}));
const id = '00000000-0000-4000-8000-000000000001';
beforeEach(() => {
  vi.clearAllMocks();
  session.mockResolvedValue({ id: 'actor' });
  workspace.mockResolvedValue({ id, joined: true });
});
async function render(
  source: {
    lettinWorld?: string | string[];
    lettinEntry?: string | string[];
  } = {}
) {
  const element = Page({
    params: Promise.resolve({ locale: 'en', wsId: 'personal' }),
    searchParams: Promise.resolve(source),
  });
  const child = element.props.children;
  return child.type(child.props);
}
it('uses the Tasks actor and resolved workspace without reading source content', async () => {
  const result = await render({ lettinWorld: id });
  expect(session).toHaveBeenCalledWith('tasks');
  expect(workspace).toHaveBeenCalledWith('personal', {
    useAdmin: true,
    user: { id: 'actor' },
  });
  expect(result.props).toMatchObject({
    wsId: id,
    routeWsId: 'personal',
    sourceUrl: `https://lettin.tuturuuu.com/en/${id}/wiki/${id}/overview?entry=${id}`,
  });
});
it('requires a Tasks session', async () => {
  session.mockResolvedValue(null);
  await expect(render()).rejects.toThrow('redirect:/login');
  expect(workspace).not.toHaveBeenCalled();
});
it('requires a joined destination workspace', async () => {
  workspace.mockResolvedValue({ id, joined: false });
  await expect(render()).rejects.toThrow('redirect:/');
  workspace.mockResolvedValue(null);
  await expect(render()).rejects.toThrow('not-found');
});
it.each([
  { lettinWorld: ['a', 'b'] },
  { lettinWorld: 'https://example.com' },
  { lettinEntry: id },
  { lettinWorld: id, lettinEntry: '../secret' },
])('rejects invalid or duplicate source parameters %j', async (source) => {
  await expect(render(source)).rejects.toThrow('not-found');
});
it('supports ordinary task creation without a source', async () => {
  expect((await render()).props.sourceUrl).toBeUndefined();
});
