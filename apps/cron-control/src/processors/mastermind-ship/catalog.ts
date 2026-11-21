// Apps the Mastermind Ship screen tracks, in display order. Each in-repo app
// names the GitHub deployment environments that record its production and
// staging releases, the paths whose commits on main make up its pending
// release, and the Cloudflare Worker serving each environment. Apps in other
// repositories read their repository from MASTERMIND_SHIP_REPOS.

export const SHIP_APP_IDS = [
  'web',
  'calendar',
  'contacts',
  'meet',
  'mail',
  'mastermind',
  'mobile',
  'upskii',
  'mastery-ai',
  'pktm',
] as const;
export type ShipAppId = (typeof SHIP_APP_IDS)[number];
export type ShipEnvName = 'production' | 'staging';

export const PLATFORM_REPOSITORY = 'tutur3u/platform';
export const PLATFORM_BRANCH = 'main';

export interface ShipAppSpec {
  id: ShipAppId;
  name: string;
  /** `owner/name`; null when the repository is not configured. */
  repository: string | null;
  branch: string;
  /** Paths whose commits count toward the pending release; empty = whole branch. */
  paths: readonly string[];
  /** Deployment environment names per environment; null = match by name. */
  environments: Record<ShipEnvName, readonly string[] | null>;
  workers: Partial<Record<ShipEnvName, string>>;
}

type InRepo = Omit<ShipAppSpec, 'repository' | 'branch'>;

const IN_REPO: readonly InRepo[] = [
  {
    id: 'web',
    name: 'Web',
    paths: ['apps/web', 'packages'],
    environments: {
      production: ['cloudflare-production-web'],
      staging: ['wave1-web-staging'],
    },
    workers: { staging: 'tuturuuu-web-wave1-staging' },
  },
  {
    id: 'calendar',
    name: 'Calendar',
    paths: ['apps/calendar'],
    environments: {
      production: ['wave1-calendar-production'],
      staging: ['wave1-calendar-staging'],
    },
    workers: {
      production: 'tuturuuu-calendar',
      staging: 'tuturuuu-calendar-wave1-staging',
    },
  },
  {
    id: 'contacts',
    name: 'Contacts',
    paths: ['apps/contacts'],
    environments: {
      production: ['wave1-contacts-production', 'contacts-cloudflare'],
      staging: ['wave1-contacts-staging'],
    },
    workers: { production: 'tuturuuu-contacts' },
  },
  {
    id: 'meet',
    name: 'Meet',
    paths: ['apps/meet', 'apps/meet-realtime'],
    environments: {
      production: ['meet-cloudflare-production', 'meet-production'],
      staging: ['wave1-meet-staging'],
    },
    workers: {
      production: 'tuturuuu-meet',
      staging: 'tuturuuu-meet-wave1-staging',
    },
  },
  {
    id: 'mail',
    name: 'Mail',
    paths: ['apps/mail'],
    environments: {
      production: ['wave1-mail-production'],
      staging: ['wave1-mail-staging'],
    },
    workers: {
      production: 'tuturuuu-mail',
      staging: 'tuturuuu-mail-wave1-staging',
    },
  },
  {
    id: 'mastermind',
    name: 'Mastermind',
    paths: ['apps/mastermind', 'apps/mastermind-store'],
    environments: {
      production: ['mastermind-production'],
      staging: [],
    },
    workers: { production: 'tuturuuu-mastermind' },
  },
  {
    id: 'mobile',
    name: 'iOS/Android',
    paths: ['apps/mobile'],
    environments: { production: ['mobile-store-beta'], staging: [] },
    workers: {},
  },
];

const EXTERNAL: readonly { id: ShipAppId; name: string; fallback?: string }[] =
  [
    { id: 'upskii', name: 'Upskii', fallback: 'upskii/platform' },
    { id: 'mastery-ai', name: 'Mastery AI' },
    { id: 'pktm', name: 'PKTM', fallback: 'tutur3u/pktm' },
  ];

const REPOSITORY = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/u;
const BRANCH = /^[A-Za-z0-9._/-]{1,100}$/u;

/**
 * `MASTERMIND_SHIP_REPOS`: comma-separated `app=owner/name[@branch]`, for
 * example `pktm=acme/pktm@main`. Unknown apps and malformed entries are
 * ignored, so a bad value never widens what the collector reads.
 */
export function parseShipRepos(raw: string | undefined) {
  const repos = new Map<ShipAppId, { repository: string; branch: string }>();
  for (const entry of (raw ?? '').split(',')) {
    const [app, target] = entry.trim().split('=');
    if (!app || !target) continue;
    const [repository, branch = 'main'] = target.split('@');
    if (
      !EXTERNAL.some((external) => external.id === app) ||
      !repository ||
      !REPOSITORY.test(repository) ||
      !BRANCH.test(branch)
    )
      continue;
    repos.set(app as ShipAppId, { repository, branch });
  }
  return repos;
}

export function shipCatalog(rawRepos?: string): ShipAppSpec[] {
  const repos = parseShipRepos(rawRepos);
  return [
    ...IN_REPO.map((app) => ({
      ...app,
      repository: PLATFORM_REPOSITORY,
      branch: PLATFORM_BRANCH,
    })),
    ...EXTERNAL.map(({ id, name, fallback }) => {
      const configured = repos.get(id);
      return {
        id,
        name,
        repository: configured?.repository ?? fallback ?? null,
        branch: configured?.branch ?? 'main',
        paths: [],
        environments: { production: null, staging: null },
        workers: {},
      } satisfies ShipAppSpec;
    }),
  ];
}

/** Matches a deployment environment by name when the catalog lists none. */
export function environmentMatches(
  spec: ShipAppSpec,
  env: ShipEnvName,
  name: string
) {
  const listed = spec.environments[env];
  if (listed) return listed.includes(name);
  return env === 'production'
    ? /production/iu.test(name) && !/preview|staging/iu.test(name)
    : /staging|preview/iu.test(name);
}
