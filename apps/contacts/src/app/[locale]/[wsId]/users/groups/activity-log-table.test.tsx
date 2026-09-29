import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UserGroupActivityLogTable } from './activity-log-table';

const { listEvents } = vi.hoisted(() => ({ listEvents: vi.fn() }));

vi.mock('@tuturuuu/users-core/lib/user-group-activity/data', () => ({
  listUserGroupActivityEventsForRange: listEvents,
}));

vi.mock('./activity-log-client', () => ({
  UserGroupActivityLogClient: ({ loadFailed }: { loadFailed: boolean }) => (
    <div data-load-failed={String(loadFailed)} />
  ),
}));

afterEach(() => {
  vi.restoreAllMocks();
  listEvents.mockReset();
});

describe('UserGroupActivityLogTable', () => {
  const props = { wsId: 'workspace-id', searchParams: {} };

  it('distinguishes an unavailable audit feed from an empty history', async () => {
    listEvents.mockRejectedValue(new Error('Audit RPC unavailable'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    const html = renderToStaticMarkup(await UserGroupActivityLogTable(props));

    expect(html).toContain('data-load-failed="true"');
    expect(log).toHaveBeenCalledOnce();
  });

  it('preserves a successful empty result as an empty history', async () => {
    listEvents.mockResolvedValue({ count: 0, data: [] });

    const html = renderToStaticMarkup(await UserGroupActivityLogTable(props));

    expect(html).toContain('data-load-failed="false"');
  });
});
