// @vitest-environment node
import {
  EASY_CENTER_TUTORING_POLICY,
  STANDARD_TUTORING_POLICY,
  serializeTutoringPolicyConfigRows,
  type TutoringPolicy,
} from '@tuturuuu/internal-api/tutoring-policy';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { describe, expect, it, vi } from 'vitest';
import { denyExcludedTutoringGroup } from './group-exclusion';

vi.mock('next/server', () => ({
  NextResponse: { json: Response.json },
}));

// Synthetic workspace and class only.
const wsId = '0b9d2f4e-1a3c-4e5f-8a7b-6c5d4e3f2a1b';
const groupId = '7e6d5c4b-3a29-4180-9f7e-6d5c4b3a2918';

type Result = { data: unknown; error: unknown };

function client({
  groupName = 'English A1',
  policy = EASY_CENTER_TUTORING_POLICY,
  tags = [] as string[],
  errors = {} as Partial<Record<string, unknown>>,
}: {
  groupName?: string | null;
  policy?: TutoringPolicy;
  tags?: string[];
  errors?: Partial<Record<string, unknown>>;
}) {
  const reads: string[] = [];
  const results: Record<string, Result> = {
    workspace_configs: {
      data: serializeTutoringPolicyConfigRows(policy),
      error: errors.workspace_configs ?? null,
    },
    workspace_user_groups: {
      data: groupName === null ? null : { id: groupId, name: groupName },
      error: errors.workspace_user_groups ?? null,
    },
    workspace_user_group_tag_groups: {
      data: tags.map((name) => ({ tag: { name } })),
      error: errors.workspace_user_group_tag_groups ?? null,
    },
  };
  const from = (table: string) => {
    reads.push(table);
    const result = () => results[table] ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'like', 'in'])
      builder[method] = () => builder;
    builder.maybeSingle = async () => result();
    // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are thenable.
    builder.then = (
      resolve: (value: Result) => unknown,
      reject: (reason: unknown) => unknown
    ) => Promise.resolve(result()).then(resolve, reject);
    return builder;
  };
  return { sbAdmin: { from } as unknown as TypedSupabaseClient, reads };
}

async function deny(
  options: Parameters<typeof client>[0],
  reasonType = 'ABSENT_RECOVERY'
) {
  const { sbAdmin, reads } = client(options);
  const response = await denyExcludedTutoringGroup({
    groupId,
    reasonType,
    sbAdmin,
    wsId,
  });
  return {
    reads,
    status: response?.status ?? null,
    body: response ? await response.json() : null,
  };
}

describe('excluded classes cannot receive new tutoring sessions', () => {
  it.each(['ABSENT_RECOVERY', 'WEAK_SUPPORT', 'CUSTOM'])(
    'refuses a %s session in a DDT class, whatever its case',
    async (reasonType) => {
      for (const groupName of ['DDT Starters', 'lớp ddt 2']) {
        const result = await deny({ groupName }, reasonType);
        expect(result.status).toBe(422);
        expect(result.body).toMatchObject({ code: 'TUTORING_GROUP_EXCLUDED' });
      }
    }
  );

  it('refuses a kindergarten class under the center preset', async () => {
    for (const groupName of ['Mẫu giáo Hoa Mai', 'Kindergarten K1'])
      expect((await deny({ groupName })).status).toBe(422);
  });

  it('allows an ordinary class', async () => {
    expect((await deny({ groupName: 'English A1' })).status).toBeNull();
  });

  it('allows a DDT class under a custom policy without a DDT rule', async () => {
    const result = await deny({
      groupName: 'DDT Starters',
      policy: { ...STANDARD_TUTORING_POLICY, preset: 'custom' },
    });
    expect(result.status).toBeNull();
    // No rule can match, so the class is not even read.
    expect(result.reads).toEqual(['workspace_configs']);
  });

  it('follows a rule scoped to one reason only', async () => {
    const policy = {
      ...STANDARD_TUTORING_POLICY,
      groupExclusions: [
        {
          scope: 'weak_support' as const,
          match: 'contains' as const,
          value: 'DDT',
        },
      ],
    };
    expect(
      (await deny({ groupName: 'DDT 1', policy }, 'ABSENT_RECOVERY')).status
    ).toBeNull();
    expect(
      (await deny({ groupName: 'DDT 1', policy }, 'WEAK_SUPPORT')).status
    ).toBe(422);
    expect(
      (await deny({ groupName: 'DDT 1', policy }, 'CUSTOM')).status
    ).toBeNull();
  });

  it('reads class tags only when a tag rule exists', async () => {
    const policy = {
      ...STANDARD_TUTORING_POLICY,
      groupExclusions: [
        {
          scope: 'all' as const,
          match: 'exact' as const,
          value: 'ddt',
          target: 'tag' as const,
        },
      ],
    };
    const tagged = await deny({ groupName: 'Class 7A', policy, tags: ['DDT'] });
    expect(tagged.status).toBe(422);
    expect(tagged.reads).toContain('workspace_user_group_tag_groups');
    const named = await deny({ groupName: 'DDT Starters' });
    expect(named.reads).not.toContain('workspace_user_group_tag_groups');
  });

  it('answers 500 when the policy, class or tags cannot be read', async () => {
    const tagPolicy = {
      ...STANDARD_TUTORING_POLICY,
      groupExclusions: [
        {
          scope: 'all' as const,
          match: 'exact' as const,
          value: 'ddt',
          target: 'tag' as const,
        },
      ],
    };
    for (const [table, policy] of [
      ['workspace_configs', EASY_CENTER_TUTORING_POLICY],
      ['workspace_user_groups', EASY_CENTER_TUTORING_POLICY],
      ['workspace_user_group_tag_groups', tagPolicy],
    ] as const) {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(
        (await deny({ policy, errors: { [table]: new Error('down') } })).status
      ).toBe(500);
    }
  });
});
