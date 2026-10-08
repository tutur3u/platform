import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn().mockResolvedValue(undefined),
}));

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  createDynamicAdminClient: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  sign: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
  createClient: mocks.createClient,
  createDynamicAdminClient: mocks.createDynamicAdminClient,
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolveAuthenticatedSessionUser,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: mocks.normalizeWorkspaceId,
  verifyWorkspaceMembershipType: mocks.verifyWorkspaceMembershipType,
}));

const WORKSPACE = '11111111-1111-4111-8111-111111111111';
const OTHER_WORKSPACE = '22222222-2222-4222-8222-222222222222';
const TEMPLATE = '33333333-3333-4333-8333-333333333333';
const OWNER = '44444444-4444-4444-8444-444444444444';
const MEMBER = '55555555-5555-4555-8555-555555555555';
const BACKGROUND = `${WORKSPACE}/template-backgrounds/private.png`;
const SIGNED_URL = 'https://storage.example.test/synthetic-background';
const sessionClient = { fixture: 'session-boundary' };

type TemplateRow = {
  background_path: string | null;
  created_by: string;
  id: string;
  visibility: 'private' | 'public' | 'workspace';
  ws_id: string;
};

let row: TemplateRow;

function createTemplateDatastore() {
  return {
    from(table: string) {
      if (table !== 'board_templates') {
        throw new Error(`Unexpected fixture table: ${table}`);
      }
      let columns: string[] = [];
      const filters = new Map<string, unknown>();
      const query = {
        select(selection: string) {
          columns = selection.split(',').map((column) => column.trim());
          return query;
        },
        eq(column: string, value: unknown) {
          filters.set(column, value);
          return query;
        },
        async maybeSingle() {
          const values = row as unknown as Record<string, unknown>;
          const matches = [...filters].every(
            ([column, value]) => values[column] === value
          );
          const projected = columns.includes('*')
            ? { ...row }
            : Object.fromEntries(
                columns.map((column) => [column, values[column]])
              );
          return { data: matches ? projected : null, error: null };
        },
      };
      return query;
    },
  };
}

async function getBackground(templateId = TEMPLATE) {
  const { GET } = await import(
    '@/app/api/v1/workspaces/[wsId]/templates/[templateId]/background-url/route'
  );
  return GET(
    new NextRequest(
      `http://localhost/api/v1/workspaces/${WORKSPACE}/templates/${templateId}/background-url`
    ),
    { params: Promise.resolve({ templateId, wsId: WORKSPACE }) }
  );
}

function expectNoSigning() {
  expect(mocks.createDynamicAdminClient).not.toHaveBeenCalled();
  expect(mocks.sign).not.toHaveBeenCalled();
}

describe('registered board-template background GET authorization', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    row = {
      background_path: BACKGROUND,
      created_by: OWNER,
      id: TEMPLATE,
      visibility: 'private',
      ws_id: WORKSPACE,
    };
    mocks.createClient.mockResolvedValue(sessionClient);
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      authError: null,
      user: { id: MEMBER },
    });
    mocks.normalizeWorkspaceId.mockResolvedValue(WORKSPACE);
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.createAdminClient.mockResolvedValue(createTemplateDatastore());
    mocks.sign.mockResolvedValue({ data: { signedUrl: SIGNED_URL }, error: null });
    mocks.createDynamicAdminClient.mockResolvedValue({
      storage: {
        from(bucket: string) {
          if (bucket !== 'workspaces') {
            throw new Error('Unexpected fixture bucket');
          }
          return { createSignedUrl: mocks.sign };
        },
      },
    });
  });

  it('denies a private template background to another member without a share', async () => {
    const response = await getBackground();

    expect(response.status).toBe(404);
    expectNoSigning();
  });

  it('allows the creator to read their private template background', async () => {
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      authError: null,
      user: { id: OWNER },
    });

    const response = await getBackground();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ signedUrl: SIGNED_URL });
    expect(mocks.sign).toHaveBeenCalledTimes(1);
    expect(mocks.sign).toHaveBeenCalledWith(BACKGROUND, 3600);
    expect(mocks.verifyWorkspaceMembershipType).toHaveBeenCalledWith({
      supabase: sessionClient,
      userId: OWNER,
      wsId: WORKSPACE,
    });
  });

  it.each(['workspace', 'public'] as const)(
    'allows a same-workspace member to read a %s template background',
    async (visibility) => {
      row.visibility = visibility;

      const response = await getBackground();

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ signedUrl: SIGNED_URL });
      expect(mocks.sign).toHaveBeenCalledTimes(1);
      expect(mocks.sign).toHaveBeenCalledWith(BACKGROUND, 3600);
    }
  );

  it('does not sign a template belonging to another workspace', async () => {
    row.ws_id = OTHER_WORKSPACE;
    row.visibility = 'public';

    const response = await getBackground();

    expect(response.status).toBe(404);
    expectNoSigning();
  });

  it('denies a nonmember before querying the administrative datastore', async () => {
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: false });

    const response = await getBackground();

    expect(response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expectNoSigning();
  });

  it('fails closed when membership lookup fails', async () => {
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      error: 'membership_lookup_failed',
      ok: false,
    });

    const response = await getBackground();

    expect(response.status).toBe(500);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expectNoSigning();
  });

  it('returns no URL for an accessible template without a background', async () => {
    row.visibility = 'workspace';
    row.background_path = null;

    const response = await getBackground();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ signedUrl: null });
    expectNoSigning();
  });

  it('rejects a malformed template ID before resolving identity', async () => {
    const response = await getBackground('not-a-guid');

    expect(response.status).toBe(400);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expectNoSigning();
  });
});
