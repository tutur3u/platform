// @vitest-environment node
import {
  EASY_CENTER_TUTORING_POLICY,
  parseTutoringPolicy,
  readTutoringPolicyConfigRows,
  serializeTutoringPolicyConfigRows,
  type TutoringPolicy,
} from '@tuturuuu/internal-api/tutoring-policy';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const wsId = '5d23287f-9094-4714-b8e0-dcce877464a0';
const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  exclusionUpgrade: false,
  resolveAccess: vi.fn(),
}));
const query = {
  select: vi.fn(() => query),
  eq: vi.fn(() => query),
  like: vi.fn(async () => ({ data: [], error: null })),
  upsert: vi.fn(
    async (
      _rows: { id: string; value: string; ws_id: string }[],
      _options?: { onConflict: string }
    ) => ({ error: null })
  ),
};

vi.mock('next/server', () => ({
  connection: async () => {},
  NextResponse: { json: Response.json },
}));
vi.mock('@tuturuuu/feature-flags', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tuturuuu/feature-flags')>();
  return {
    ...actual,
    evaluateFlags: (...args: Parameters<typeof actual.evaluateFlags>) => ({
      ...actual.evaluateFlags(...args),
      tutoring_exclusion_upgrade: mocks.exclusionUpgrade,
    }),
  };
});
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/lib/tutoring/route-access', () => ({
  resolveTutoringRouteAccess: mocks.resolveAccess,
}));

async function request(method: 'GET' | 'PUT', body?: unknown) {
  const route = await import('./route');
  return route[method](
    new Request(`http://localhost/api/v1/workspaces/${wsId}/tutoring/policy`, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    { params: Promise.resolve({ wsId }) }
  );
}

const IELTS_RULE = { scope: 'all', match: 'contains', value: 'IELTS' };
const DDT_ONLY = [{ scope: 'all', match: 'contains', value: 'DDT' }];

/** Stored Easy Center rows whose exclusions are omitted or DDT-only. */
function storedEasyCenterRows(exclusions: 'omitted' | 'ddt-only') {
  const { groupExclusions: _omit, ...rest } = EASY_CENTER_TUTORING_POLICY;
  const stored =
    exclusions === 'omitted' ? rest : { ...rest, groupExclusions: DDT_ONLY };
  return serializeTutoringPolicyConfigRows(stored as TutoringPolicy);
}

function storedPolicy(rows: { id: string; value: string }[]) {
  query.like.mockResolvedValueOnce({ data: rows, error: null } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.exclusionUpgrade = false;
  mocks.resolveAccess.mockResolvedValue({
    normalizedWsId: wsId,
    permissions: { withoutPermission: () => false },
  });
  mocks.createAdminClient.mockResolvedValue({ from: () => query });
});

describe('tutoring policy API', () => {
  it('returns safe defaults when the workspace has no custom policy', async () => {
    const response = await request('GET');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      isConfigured: false,
      policy: { durationMinutes: 45, leadMinutes: 45 },
    });
    expect(query.eq).toHaveBeenCalledWith('ws_id', wsId);
  });

  it('rejects invalid settings before writing', async () => {
    const response = await request('PUT', {
      ...EASY_CENTER_TUTORING_POLICY,
      leadMinutes: -1,
    });
    expect(response.status).toBe(400);
    expect(query.upsert).not.toHaveBeenCalled();
  });

  it('requires settings permission to save', async () => {
    mocks.resolveAccess.mockResolvedValue({
      normalizedWsId: wsId,
      permissions: { withoutPermission: () => true },
    });
    expect((await request('PUT', EASY_CENTER_TUTORING_POLICY)).status).toBe(
      403
    );
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('saves tutor groups alongside every other policy field', async () => {
    const tutorGroupId = '22222222-2222-4222-8222-222222222222';
    const policy = {
      ...EASY_CENTER_TUTORING_POLICY,
      preset: 'custom' as const,
      campusByGroupId: {
        '11111111-1111-4111-8111-111111111111': 'Legacy Annex',
      },
      tutorGroupIds: [tutorGroupId, tutorGroupId.toUpperCase()],
    };
    const response = await request('PUT', policy);
    expect(response.status).toBe(200);
    const saved = query.upsert.mock.calls[0]?.[0] ?? [];
    expect(readTutoringPolicyConfigRows(saved)).toEqual({
      ...policy,
      tutorGroupIds: [tutorGroupId],
    });
  });

  it('rejects a tutor group that is not a UUID before writing', async () => {
    const response = await request('PUT', {
      ...EASY_CENTER_TUTORING_POLICY,
      tutorGroupIds: ['not-a-group'],
    });
    expect(response.status).toBe(400);
    expect(query.upsert).not.toHaveBeenCalled();
  });

  it('stores a validated policy in the authorized workspace', async () => {
    const response = await request('PUT', EASY_CENTER_TUTORING_POLICY);
    expect(response.status).toBe(200);
    expect(query.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ ws_id: wsId })]),
      { onConflict: 'ws_id,id' }
    );
    const saved = query.upsert.mock.calls[0]?.[0] ?? [];
    expect(
      saved.every((row: { value: string }) => row.value.length <= 1000)
    ).toBe(true);
    expect(readTutoringPolicyConfigRows(saved)).toMatchObject(
      EASY_CENTER_TUTORING_POLICY
    );
  });

  it('saves the campus list alongside every other policy field', async () => {
    const policy = {
      ...EASY_CENTER_TUTORING_POLICY,
      preset: 'custom' as const,
      campusByGroupId: {
        '11111111-1111-4111-8111-111111111111': 'Legacy Annex',
      },
      campusOptions: [' Campus North ', 'Campus North', ''],
    };
    const response = await request('PUT', policy);
    expect(response.status).toBe(200);
    const saved = query.upsert.mock.calls[0]?.[0] ?? [];
    expect(readTutoringPolicyConfigRows(saved)).toEqual({
      ...policy,
      campusOptions: ['Campus North'],
    });
  });

  describe.each(['omitted', 'ddt-only'] as const)(
    'flag gating with stored %s exclusions',
    (exclusions) => {
      it('flag OFF: the GET body is byte-identical to main', async () => {
        const rows = storedEasyCenterRows(exclusions);
        storedPolicy(rows);
        const response = await request('GET');
        expect(response.status).toBe(200);
        const text = await response.text();
        // main's body: { policy, isConfigured } with main's parser (flag off).
        const mainBody = {
          policy: readTutoringPolicyConfigRows(rows),
          isConfigured: true,
        };
        expect(JSON.parse(text)).toEqual(mainBody);
        expect(Object.keys(JSON.parse(text))).toEqual([
          'policy',
          'isConfigured',
        ]);
        expect(text).toBe(JSON.stringify(mainBody));
        expect(text).not.toContain('IELTS');
      });

      it('flag ON: the GET returns the IELTS rule and exclusionUpgrade', async () => {
        mocks.exclusionUpgrade = true;
        storedPolicy(storedEasyCenterRows(exclusions));
        const body = await (await request('GET')).json();
        expect(body.exclusionUpgrade).toBe(true);
        expect(body.isConfigured).toBe(true);
        expect(body.policy.groupExclusions).toEqual([
          ...EASY_CENTER_TUTORING_POLICY.groupExclusions,
          IELTS_RULE,
        ]);
      });

      it('flag OFF: the PUT writes main rows without IELTS', async () => {
        const { groupExclusions: _omit, ...rest } = EASY_CENTER_TUTORING_POLICY;
        const body =
          exclusions === 'omitted'
            ? rest
            : { ...rest, groupExclusions: DDT_ONLY };
        const response = await request('PUT', body);
        expect(response.status).toBe(200);
        const saved = query.upsert.mock.calls[0]?.[0] ?? [];
        const mainPolicy = parseTutoringPolicy(body);
        expect(mainPolicy).not.toBeNull();
        expect(
          saved.map(({ id, value, ws_id }) => ({ id, value, ws_id }))
        ).toEqual(
          serializeTutoringPolicyConfigRows(mainPolicy as TutoringPolicy).map(
            (row) => ({ ...row, ws_id: wsId })
          )
        );
        expect(JSON.stringify(saved)).not.toContain('IELTS');
        expect(await response.json()).toEqual({ policy: mainPolicy });
      });

      it('flag ON: the PUT persists the IELTS rule', async () => {
        mocks.exclusionUpgrade = true;
        const { groupExclusions: _omit, ...rest } = EASY_CENTER_TUTORING_POLICY;
        const body =
          exclusions === 'omitted'
            ? rest
            : { ...rest, groupExclusions: DDT_ONLY };
        const response = await request('PUT', body);
        expect(response.status).toBe(200);
        const saved = query.upsert.mock.calls[0]?.[0] ?? [];
        // Read back with the flag OFF: the rule is stored explicitly.
        expect(readTutoringPolicyConfigRows(saved).groupExclusions).toEqual([
          ...EASY_CENTER_TUTORING_POLICY.groupExclusions,
          IELTS_RULE,
        ]);
      });
    }
  );
});
