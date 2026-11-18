import type { DeployFact } from '@tuturuuu/roadmap-core/insights/activity.ts';
import {
  classifyTitle,
  isNoise,
} from '@tuturuuu/roadmap-core/history/classify.ts';
import {
  type CommitFact,
  type CommitWindow,
  isNoiseCommit,
} from '@tuturuuu/roadmap-core/insights/commits.ts';
import { localDay } from '@tuturuuu/roadmap-core/live/feed.ts';
import { readBounded } from '@tuturuuu/roadmap-core/live/host-probe.ts';
import type { PrFact } from '@tuturuuu/roadmap-core/live/model.ts';

export const DAY_MS = 86_400_000;
export const ROADMAP_DAYS = 30;
const MAX_RECENT = 5;
const MAX_DEPLOYS = 20;
const PRODUCT_KEYS = [
  'tasks',
  'calendar',
  'mail',
  'meet',
  'chat',
  'drive',
  'finance',
  'mira',
  'mobile',
  'contacts',
  'inventory',
  'mind',
  'nova',
  'upskii',
  'track',
  'forms',
  'other',
] as const;
const SHA = /^[a-f0-9]{40}$/;

type RecentCommit = {
  sha: string;
  subject: string;
  pr: number | null;
  date: string;
  live: true | null;
};
type Deployment = {
  env: 'production' | 'staging' | 'database';
  sha: string;
  at: string;
  apps: number;
};
type PreviousDeployment = Omit<Deployment, 'apps'> & { apps?: number };

export type RoadmapSnapshot = {
  commits7d: number;
  commits7dPrev: number;
  daily?: number[];
  products: {
    key: string;
    commits7d: number;
    commits7dPrev: number;
    commits30d: number;
    daily: number[];
    prs7d: number;
    recent: RecentCommit[];
  }[];
  deploys: Deployment[];
  productionSha: string | null;
  generatedAt: string;
};

export async function readProduction(
  fetcher: typeof fetch,
  now: number
): Promise<DeployFact | null> {
  try {
    const response = await fetcher('https://tuturuuu.com/api/build-info', {
      redirect: 'error',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const { commitHash, builtAt, environment, appName } = JSON.parse(
      await readBounded(response)
    );
    const timestamp = typeof builtAt === 'string' ? Date.parse(builtAt) : NaN;
    if (
      appName !== 'web' ||
      environment !== 'production' ||
      typeof commitHash !== 'string' ||
      !SHA.test(commitHash) ||
      !Number.isFinite(timestamp) ||
      timestamp > now
    )
      return null;
    return {
      app: 'web',
      commit: commitHash,
      builtAt: new Date(timestamp).toISOString(),
    };
  } catch {
    return null;
  }
}

export function buildRoadmapSnapshot({
  now,
  window,
  facts,
  prs,
  deployed,
  previousDeploys,
  buildDeploys = [],
  parentsBySha = new Map(),
}: {
  now: number;
  window: CommitWindow;
  facts: readonly CommitFact[];
  prs: readonly PrFact[];
  deployed: DeployFact | null;
  previousDeploys: readonly PreviousDeployment[];
  buildDeploys?: readonly DeployFact[];
  parentsBySha?: ReadonlyMap<string, readonly string[]>;
}): RoadmapSnapshot {
  const generatedAt = new Date(now).toISOString();
  const weekStart = localDay(new Date(now - 6 * DAY_MS).toISOString());
  const previousWeekStart = localDay(new Date(now - 13 * DAY_MS).toISOString());
  const knownTracks = new Set(window.tracks);
  const products = PRODUCT_KEYS.map((key) => ({
    key,
    commits7d: 0,
    commits7dPrev: 0,
    commits30d: 0,
    daily: Array<number>(ROADMAP_DAYS).fill(0),
    prs7d: 0,
    recent: [] as RecentCommit[],
  }));
  const byKey = new Map<string, (typeof products)[number]>(
    products.map((product) => [product.key, product])
  );
  const productFor = (track: string) =>
    byKey.get(track === 'mastermind' ? 'mind' : track) ?? byKey.get('other');
  for (const [day, index, count] of window.products) {
    const product = productFor(window.tracks[index]);
    if (!product) continue;
    const offset = (Date.parse(day) - Date.parse(window.from)) / DAY_MS;
    product.daily[offset] += count;
    product.commits30d += count;
    if (day >= weekStart) product.commits7d += count;
    else if (day >= previousWeekStart) product.commits7dPrev += count;
  }
  for (const pr of prs) {
    if (
      !pr.mergedAt ||
      pr.mergedAt > generatedAt ||
      localDay(pr.mergedAt) < weekStart ||
      isNoise(pr.title, null)
    )
      continue;
    const product = productFor(classifyTitle(pr.title, knownTracks).track);
    if (product) product.prs7d += 1;
  }
  const prNumbers = new Set(prs.map(({ number }) => number));
  const productionSha = deployed?.commit ?? null;
  const live = new Set<string>();
  const pending = productionSha ? [productionSha] : [];
  while (pending.length) {
    const sha = pending.pop();
    if (!sha || live.has(sha)) continue;
    live.add(sha);
    pending.push(...(parentsBySha.get(sha) ?? []));
  }
  const ordered = [
    ...new Map(facts.map((fact) => [fact.sha, fact])).values(),
  ].sort(
    (a, b) => Date.parse(b.at) - Date.parse(a.at) || a.sha.localeCompare(b.sha)
  );
  const daily = Array<number>(ROADMAP_DAYS).fill(0);
  let commits7d = 0;
  let commits7dPrev = 0;
  for (const fact of ordered) {
    const day = localDay(fact.at);
    if (Date.parse(fact.at) > now || day < window.from) continue;
    daily[(Date.parse(day) - Date.parse(window.from)) / DAY_MS] += 1;
    if (day >= weekStart) commits7d += 1;
    else if (day >= previousWeekStart) commits7dPrev += 1;
    if (isNoiseCommit(fact)) continue;
    const { track, title } = classifyTitle(fact.subject, knownTracks);
    const product = productFor(track);
    if (
      !product ||
      product.key === 'other' ||
      !title ||
      product.recent.length >= MAX_RECENT
    )
      continue;
    const referenced = Number(/\(#(\d+)\)\s*$/.exec(fact.subject)?.[1]);
    product.recent.push({
      sha: fact.sha,
      subject: title,
      pr: prNumbers.has(referenced) ? referenced : null,
      date: new Date(fact.at).toISOString(),
      live: live.has(fact.sha) ? true : null,
    });
  }
  return {
    commits7d,
    commits7dPrev,
    daily,
    products,
    deploys: deploymentMarkers(buildDeploys, deployed, previousDeploys),
    productionSha,
    generatedAt,
  };
}

function deploymentMarkers(
  buildDeploys: readonly DeployFact[],
  deployed: DeployFact | null,
  previous: readonly PreviousDeployment[]
) {
  const grouped = new Map<string, { at: string; apps: Set<string> }>();
  for (const { app, commit, builtAt } of deployed
    ? [...buildDeploys, deployed]
    : buildDeploys) {
    const group = grouped.get(commit) ?? { at: builtAt, apps: new Set() };
    if (builtAt < group.at) group.at = builtAt;
    group.apps.add(app);
    grouped.set(commit, group);
  }
  const markers = new Map<string, Deployment>();
  for (const entry of previous) {
    const current = markers.get(entry.sha);
    markers.set(entry.sha, {
      env: entry.env,
      sha: entry.sha,
      at: current && current.at < entry.at ? current.at : entry.at,
      apps: Math.max(current?.apps ?? 0, entry.apps ?? 1),
    });
  }
  for (const [sha, group] of grouped) {
    const current = markers.get(sha);
    markers.set(sha, {
      env: 'production',
      sha,
      at: current && current.at < group.at ? current.at : group.at,
      apps: Math.max(current?.apps ?? 0, group.apps.size),
    });
  }
  return [...markers.values()]
    .sort((a, b) => b.at.localeCompare(a.at) || a.sha.localeCompare(b.sha))
    .slice(0, MAX_DEPLOYS);
}
