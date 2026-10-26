// @vitest-environment node
import {
  STANDARD_TUTORING_POLICY,
  serializeTutoringPolicyConfigRows,
} from '@tuturuuu/internal-api/tutoring-policy';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const wsId = '5d23287f-9094-4714-b8e0-dcce877464a0';
const groupId = '44444444-4444-4444-8444-444444444444';
const studentUserId = '55555555-5555-4555-8555-555555555555';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getPermissions: vi.fn(),
}));

vi.mock('next/server', () => ({
  NextResponse: { json: Response.json },
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: async () => ({}),
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: async () => wsId,
  getPermissions: mocks.getPermissions,
}));

let restrict = false;
let learnerFound = true;
const feedbackUpdates: { values: unknown; filters: [string, unknown][] }[] = [];

function admin() {
  return {
    from: (table: string) => {
      const filters: [string, unknown][] = [];
      let values: unknown = null;
      const query = {
        eq: (column: string, value: unknown) => {
          filters.push([column, value]);
          return query;
        },
        like: async () => ({
          data: serializeTutoringPolicyConfigRows({
            ...STANDARD_TUTORING_POLICY,
            restrictWeakContentEditors: restrict,
          }),
          error: null,
        }),
        maybeSingle: async () => ({
          data: learnerFound ? { id: 'found' } : null,
          error: null,
        }),
        select: () => {
          if (table === 'user_feedbacks' && values) {
            feedbackUpdates.push({ values, filters: [...filters] });
            return Promise.resolve({ data: [{ id: 'f1' }], error: null });
          }
          return query;
        },
        update: (next: unknown) => {
          values = next;
          return query;
        },
      };
      return query;
    },
  };
}

function permissions(granted: string[]) {
  return {
    wsId,
    containsPermission: (permission: string) => granted.includes(permission),
    withoutPermission: (permission: string) => !granted.includes(permission),
  };
}

async function endSupport(body: unknown = { groupId, studentUserId }) {
  const { POST } = await import('./route');
  return POST(
    new Request(
      `http://localhost/api/v1/workspaces/${wsId}/tutoring/weak-support/end`,
      { method: 'POST', body: JSON.stringify(body) }
    ),
    { params: Promise.resolve({ wsId }) }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  restrict = false;
  learnerFound = true;
  feedbackUpdates.length = 0;
  mocks.createAdminClient.mockImplementation(async () => admin());
  mocks.getPermissions.mockResolvedValue(
    permissions(['update_user_groups_scores'])
  );
});

describe('end weak-support tutoring', () => {
  it('clears the needs-support flag for the learner in that class', async () => {
    const response = await endSupport();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      cleared: 1,
      message: 'success',
    });
    expect(feedbackUpdates).toEqual([
      {
        values: { require_attention: false },
        filters: [
          ['user_id', studentUserId],
          ['group_id', groupId],
          ['require_attention', true],
        ],
      },
    ]);
  });

  it('requires feedback access', async () => {
    mocks.getPermissions.mockResolvedValue(permissions([]));
    expect((await endSupport()).status).toBe(403);
    expect(feedbackUpdates).toEqual([]);
  });

  it('requires class management when the policy restricts content', async () => {
    restrict = true;
    expect((await endSupport()).status).toBe(403);
    expect(feedbackUpdates).toEqual([]);

    mocks.getPermissions.mockResolvedValue(
      permissions(['update_user_groups_scores', 'update_user_groups'])
    );
    expect((await endSupport()).status).toBe(200);
  });

  it('rejects learners outside the workspace and malformed input', async () => {
    learnerFound = false;
    expect((await endSupport()).status).toBe(404);
    expect((await endSupport({ groupId: 'nope' })).status).toBe(400);
    expect(feedbackUpdates).toEqual([]);
  });
});
