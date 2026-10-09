import { isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  permissions: vi.fn(),
  filter: vi.fn(() => null),
  editor: vi.fn(() => null),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/lib/workspace', () => ({
  getContactsWorkspacePermissions: mocks.permissions,
}));
vi.mock('@tuturuuu/ui/custom/user-filters', () => ({ Filter: mocks.filter }));
vi.mock('./editable-report-preview', () => ({ default: mocks.editor }));
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'en',
  getTranslations: async () => (key: string) => key,
}));
vi.mock('next/server', () => ({ connection: async () => undefined }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not-found');
  },
  redirect: () => {
    throw new Error('redirect');
  },
}));

import Page from './page';

const ws = 'workspace-1';
const row = (id: string, user = ws, group: string | null = ws) => ({
  id,
  user_ws_id: user,
  group_ws_id: group,
  user_id: 'learner-1',
  group_id: 'group-1',
  title: id,
  content: 'Synthetic lesson',
  feedback: 'Synthetic human feedback',
  created_at: '2026-10-01T00:00:00Z',
  report_approval_status: 'PENDING',
});
let reports: ReturnType<typeof row>[];
let allowed: boolean;
let privateReads: number;
function reportQuery() {
  privateReads++;
  const filters: [string, unknown][] = [];
  let single = false;
  const result = () => {
    const matches = reports.filter((r) =>
      filters.every(([key, value]) => r[key as keyof typeof r] === value)
    );
    return {
      data: single ? (matches[0] ?? null) : matches,
      count: matches.length,
      error: null,
    };
  };
  const q = {
    select: () => q,
    order: () => q,
    eq: (key: string, value: unknown) => {
      filters.push([key, value]);
      return q;
    },
    maybeSingle: () => {
      single = true;
      return q;
    },
    // biome-ignore lint/suspicious/noThenProperty: emulate the real lazy PostgREST query contract.
    then: (resolve: (value: ReturnType<typeof result>) => unknown) =>
      Promise.resolve(result()).then(resolve),
  };
  return q;
}
function publicQuery(data: unknown[]) {
  const q = {
    in: () => q,
    select: () => q,
    eq: () => q,
    order: () => q,
    // biome-ignore lint/suspicious/noThenProperty: emulate the real lazy PostgREST query contract.
    then: (
      resolve: (value: {
        data: unknown[];
        count: number;
        error: null;
      }) => unknown
    ) =>
      Promise.resolve({ data, count: data.length, error: null }).then(resolve),
  };
  return q;
}
function find(node: ReactNode, type: unknown, tag?: string): any {
  if (Array.isArray(node))
    return node.map((child) => find(child, type, tag)).find(Boolean);
  if (!isValidElement(node)) return null;
  const props = node.props as { children?: ReactNode; tag?: string };
  if (node.type === type && (!tag || props.tag === tag)) return node;
  return find(props.children, type, tag);
}
const load = (id: string) =>
  Page({
    params: Promise.resolve({ wsId: ws, reportId: id }),
    searchParams: Promise.resolve({ q: '', page: '1', pageSize: '20' }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  allowed = true;
  privateReads = 0;
  reports = [
    row('own'),
    row('foreign-group', ws, 'workspace-2'),
    row('null-group', ws, null),
    row('foreign-subject', 'workspace-2'),
  ];
  mocks.permissions.mockImplementation(async () => ({
    containsPermission: (permission: string) =>
      allowed && permission === 'view_user_groups_reports',
  }));
  mocks.createAdminClient.mockResolvedValue({
    schema: () => ({ from: reportQuery }),
    from: (table: string) =>
      publicQuery(
        table === 'workspace_configs'
          ? []
          : [{ id: 'group-1', name: 'Synthetic group' }]
      ),
    rpc: () =>
      publicQuery([
        { id: 'learner-1', full_name: 'Synthetic learner', archived: false },
      ]),
  });
});
describe('Contacts actual report detail tenant boundary', () => {
  for (const id of ['foreign-group', 'null-group', 'foreign-subject']) {
    it(`returns not found for ${id} instead of exposing report content`, async () => {
      await expect(load(id)).rejects.toThrow('not-found');
    });
  }
  it('renders own detail but excludes foreign/null group sibling history', async () => {
    const page = await load('own');
    expect(find(page, mocks.editor).props.report.id).toBe('own');
    const history = find(page, mocks.filter, 'reportId');
    expect(
      history.props.options.map((option: { value: string }) => option.value)
    ).toEqual(['own']);
  });
  it('denies missing permission before report reads', async () => {
    allowed = false;
    await expect(load('own')).rejects.toThrow('not-found');
    expect(privateReads).toBe(0);
  });
});
