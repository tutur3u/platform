// @vitest-environment node

import {
  EASY_CENTER_TUTORING_POLICY,
  serializeTutoringPolicyConfigRows,
  type TutoringPolicy,
} from '@tuturuuu/internal-api/tutoring-policy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const wsId = '5d23287f-9094-4714-b8e0-dcce877464a0';
const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  exclusionUpgrade: false,
  // Every policy the routes read, in call order.
  readPolicies: [] as TutoringPolicy[],
  resolveAccess: vi.fn(),
}));

let attendanceRows: unknown[] = [];
let membershipRows: unknown[] = [];
let configRows: unknown[] = [];

function query(rows: () => unknown[]) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    gte: () => builder,
    lt: () => builder,
    neq: () => builder,
    or: () => builder,
    like: () => builder,
    order: () => builder,
    limit: () => builder,
    range: () => builder,
    // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are thenable.
    then(
      resolve: (value: unknown) => unknown,
      reject: (error: unknown) => unknown
    ) {
      return Promise.resolve({ data: rows(), error: null }).then(
        resolve,
        reject
      );
    },
  };
  return builder;
}

vi.mock('next/server', () => ({
  connection: async () => {},
  NextResponse: { json: Response.json },
}));
vi.mock('@/legacy-api-routes/head', () => ({
  createLegacyGetHandler: (handler: unknown) => handler,
  createLegacyHeadHandler: () => async () => new Response(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/lib/tutoring/route-access', () => ({
  resolveTutoringRouteAccess: mocks.resolveAccess,
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
vi.mock('@tuturuuu/internal-api/tutoring-policy', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@tuturuuu/internal-api/tutoring-policy')
    >();
  return {
    ...actual,
    readTutoringPolicyConfigRows: (
      ...args: Parameters<typeof actual.readTutoringPolicyConfigRows>
    ) => {
      const policy = actual.readTutoringPolicyConfigRows(...args);
      mocks.readPolicies.push(policy);
      return policy;
    },
  };
});

const CLASSES = {
  'class-ielts': 'IELTS 6.5 Evening',
  'class-ddt': 'Kindergarten DDT',
  'class-general': 'English ABC',
} as const;
type ClassId = keyof typeof CLASSES;

const learner = (id: string) => ({
  full_name: `Synthetic learner ${id}`,
  display_name: null,
  email: null,
});

function useClasses() {
  const today = new Date().toISOString().slice(0, 10);
  const ids = Object.keys(CLASSES) as ClassId[];
  attendanceRows = ids.map((group) => ({
    group_id: group,
    user_id: `learner-${group}`,
    date: today,
    group: { name: CLASSES[group] },
    user: learner(group),
  }));
  membershipRows = ids.map((group) => ({
    group_id: group,
    user_id: `learner-${group}`,
    group: { name: CLASSES[group] },
    user: learner(group),
  }));
}

const { groupExclusions: easyExclusions, ...easyWithoutExclusions } =
  EASY_CENTER_TUTORING_POLICY;
const STORED = {
  omitted: easyWithoutExclusions,
  'ddt-only': {
    ...easyWithoutExclusions,
    groupExclusions: [{ scope: 'all', match: 'contains', value: 'DDT' }],
  },
  'main 3-rule': EASY_CENTER_TUTORING_POLICY,
} as const;

async function settingsPolicy(): Promise<TutoringPolicy> {
  const { GET } = await import('./policy/route');
  const response = await GET(
    new Request(`http://localhost/api/v1/workspaces/${wsId}/tutoring/policy`),
    { params: Promise.resolve({ wsId }) }
  );
  return (await response.json()).policy;
}

async function queueGroups() {
  const { GET } = await import('./queue/route');
  const response = await GET(
    new Request(`http://localhost/api/v1/workspaces/${wsId}/tutoring/queue`),
    { params: Promise.resolve({ wsId }) }
  );
  if (!response) throw new Error('Tutoring queue returned no response');
  const body = (await response.json()) as { data: { group_id: string }[] };
  return body.data.map((row) => row.group_id).sort();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.exclusionUpgrade = false;
  mocks.readPolicies.length = 0;
  useClasses();
  mocks.resolveAccess.mockResolvedValue({
    normalizedWsId: wsId,
    permissions: { withoutPermission: () => false },
  });
  mocks.createAdminClient.mockResolvedValue({
    from: (name: string) => {
      if (name === 'user_group_attendance') return query(() => attendanceRows);
      if (name === 'user_feedbacks') return query(() => []);
      if (name === 'workspace_user_groups_users')
        return query(() => membershipRows);
      if (name === 'workspace_user_group_tag_groups') return query(() => []);
      if (name === 'workspace_configs') return query(() => configRows);
      throw new Error(`Unexpected table ${name}`);
    },
    schema: () => ({ from: () => query(() => []) }),
  });
});

afterEach(() => vi.useRealTimers());

describe.each([
  { flag: true, stored: 'omitted', ielts: true },
  { flag: true, stored: 'ddt-only', ielts: true },
  { flag: true, stored: 'main 3-rule', ielts: false },
  { flag: false, stored: 'omitted', ielts: false },
  { flag: false, stored: 'ddt-only', ielts: false },
  { flag: false, stored: 'main 3-rule', ielts: false },
] as const)(
  'settings and queue agree (flag $flag, stored $stored exclusions)',
  ({ flag, stored, ielts }) => {
    it('gives the same effective exclusions and queue membership', async () => {
      mocks.exclusionUpgrade = flag;
      configRows = serializeTutoringPolicyConfigRows(
        STORED[stored] as TutoringPolicy
      );

      const settings = await settingsPolicy();
      const groups = await queueGroups();
      expect(mocks.readPolicies).toHaveLength(2);
      const [settingsRead, queueRead] = mocks.readPolicies;
      expect(settings).toEqual(settingsRead);
      expect(queueRead?.groupExclusions).toEqual(settings.groupExclusions);

      const hasIelts = settings.groupExclusions.some(
        (rule) => rule.value === 'IELTS'
      );
      expect(hasIelts).toBe(ielts);
      expect(settings.groupExclusions.slice(0, easyExclusions.length)).toEqual(
        easyExclusions
      );
      // The queue hides exactly the classes the settings page says it hides.
      expect(groups).toEqual(
        ielts ? ['class-general'] : ['class-general', 'class-ielts']
      );
    });
  }
);
