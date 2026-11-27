import { exchangeCliToken } from './auth';

const workspaceId = 'a65cebd7-3a8c-4883-a3d9-82f9703d652f';
const fixtureUserId = '00000000-0000-4000-8000-000000000001';
const usage =
  'Usage: ttr ieeai handbook stats --from <YYYY-MM-DD> --to <YYYY-MM-DD> | --fixture';

type Membership = {
  workspaceId: string;
  userId: string;
  role: string;
  roleSources: readonly string[];
};

export async function readHandbookFixture(
  authenticate: () => Promise<{ valid: boolean; userId: string }>,
  membership: Membership
) {
  const identity = await authenticate().catch(() => null);
  if (
    identity?.valid !== true ||
    !identity.userId ||
    identity.userId !== membership.userId ||
    membership.workspaceId !== workspaceId ||
    membership.role !== 'admin' ||
    !membership.roleSources.some(
      (source) => source === 'creator' || source === 'role'
    )
  ) {
    throw new Error('IEEAI workspace administrator identity required.');
  }

  return {
    source: 'fixture',
    from: '2026-11-26',
    to: '2026-11-26',
    timezone: 'Asia/Ho_Chi_Minh',
    rows: [
      { day: '2026-11-26', lang: 'vi', event: 'view', n: 12 },
      { day: '2026-11-26', lang: 'en', event: 'download', n: 3 },
    ],
  };
}

export async function runIeeaiCommand(args: string[]) {
  if (args.length === 0 || (args.length === 1 && args[0] === '--help')) {
    process.stdout.write(`${usage}\n`);
    return;
  }
  if (args[0] !== 'handbook' || args[1] !== 'stats') throw new Error(usage);
  if (args.length === 6 && args[2] === '--from' && args[4] === '--to') {
    const { readLiveHandbookStats } = await import('./ieeai-live');
    const result = await readLiveHandbookStats(args[3] ?? '', args[5] ?? '');
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (args.length !== 3 || args[2] !== '--fixture') throw new Error(usage);

  const result = await readHandbookFixture(
    () =>
      exchangeCliToken({
        baseUrl: 'https://ieeai-fixture.invalid',
        token: 'fixture-placeholder',
        fetch: async (url, options) => {
          if (
            url !== 'https://ieeai-fixture.invalid/api/cli/auth/verify' ||
            options?.method !== 'POST'
          ) {
            throw new Error('Unexpected fixture identity request.');
          }
          return Response.json({
            valid: true,
            userId: fixtureUserId,
            sessionCreated: true,
            session: {
              access_token: 'fixture-placeholder',
              refresh_token: 'fixture-placeholder',
            },
          });
        },
      }),
    {
      workspaceId,
      userId: fixtureUserId,
      role: 'admin',
      roleSources: ['role'],
    }
  );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
