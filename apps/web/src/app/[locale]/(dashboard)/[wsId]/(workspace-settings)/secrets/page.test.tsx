import type { WorkspaceSecret } from '@tuturuuu/types/primitives/WorkspaceSecret';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  getWorkspace: vi.fn(),
  getWorkspaceSecretsAccess: vi.fn(),
  getPermissions: vi.fn(),
  from: vi.fn(),
  rollout: vi.fn(),
  verifySecret: vi.fn(),
  table: vi.fn(),
}));

vi.mock('next/server', () => ({ connection: mocks.connection }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspace: mocks.getWorkspace,
  getPermissions: mocks.getPermissions,
  verifySecret: mocks.verifySecret,
}));
vi.mock('@/legacy-api-routes/workspaces/[wsId]/secrets/access', () => ({
  getWorkspaceSecretsAccess: mocks.getWorkspaceSecretsAccess,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: async () => ({ from: mocks.from }),
}));
vi.mock('@tuturuuu/storage-core/workspace-storage-migration', () => ({
  getWorkspaceStorageRolloutState: mocks.rollout,
}));
vi.mock('@tuturuuu/ui/custom/feature-summary', () => ({ default: () => null }));
vi.mock('@tuturuuu/ui/custom/tables/custom-data-table', () => ({
  CustomDataTable: (props: { data: WorkspaceSecret[] }) => {
    mocks.table(props);
    return <div>{props.data.map((secret) => secret.name).join(',')}</div>;
  },
}));
vi.mock('@tuturuuu/ui/separator', () => ({ Separator: () => null }));
vi.mock('./columns', () => ({ secretColumns: () => [] }));
vi.mock('./form', () => ({ default: () => null }));
vi.mock('./periodic-report-delivery-readiness', () => ({
  PeriodicReportDeliveryReadiness: () => null,
}));
vi.mock('./storage-rollout-panel', () => ({ StorageRolloutPanel: () => null }));

import Page from './page';

const wsId = '00000000-0000-4000-8000-000000000011';
const secret = { id: 'secret-1', ws_id: wsId, name: 'EXAMPLE', value: 'false' };
const query = Object.assign(
  Promise.resolve({ data: [secret], count: 1, error: null }),
  {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
  }
);

function renderPage(id = wsId) {
  return Page({
    params: Promise.resolve({ wsId: id }),
    searchParams: Promise.resolve({}),
  });
}

describe('Workspace secrets page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWorkspace.mockResolvedValue({ id: wsId });
    // A workspace owner need not have a root-workspace permission record.
    mocks.getPermissions.mockResolvedValue(null);
    mocks.getWorkspaceSecretsAccess.mockResolvedValue({
      allowed: true,
      db: { from: mocks.from },
      resolvedWsId: wsId,
    });
    mocks.from.mockReturnValue(query);
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.range.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.rollout.mockResolvedValue({});
    mocks.verifySecret.mockResolvedValue(false);
  });

  it.each([wsId, 'personal'])(
    'renders the resolved %s workspace with API-authorized access',
    async (id) => {
      const markup = renderToStaticMarkup(await renderPage(id));
      expect(markup).toContain('EXAMPLE');
      expect(mocks.connection).toHaveBeenCalledOnce();
      expect(mocks.getWorkspace).toHaveBeenCalledWith(id);
      expect(mocks.getWorkspaceSecretsAccess).toHaveBeenCalledWith(wsId);
      expect(query.eq).toHaveBeenCalledWith('ws_id', wsId);
      expect(mocks.table).toHaveBeenCalledWith(
        expect.objectContaining({ data: [secret], count: 1 })
      );
    }
  );

  it('does not fetch secrets or storage when access is denied', async () => {
    mocks.getWorkspaceSecretsAccess.mockResolvedValue({
      allowed: false,
      status: 403,
    });
    await expect(renderPage()).rejects.toThrow('NOT_FOUND');
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rollout).not.toHaveBeenCalled();
  });

  it('does not access secrets for a missing workspace', async () => {
    mocks.getWorkspace.mockResolvedValue(null);
    await expect(renderPage()).rejects.toThrow('NOT_FOUND');
    expect(mocks.getWorkspaceSecretsAccess).not.toHaveBeenCalled();
  });
});
