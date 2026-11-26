import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  productionAppExclusions,
  productionPublicationExemptions,
  productionPublicationPolicy,
} from '../../tuturuuu.ci.ts';
import { cloudflareProductionTargets } from '../../tuturuuu.ts';
import { productionPublicationHold } from './production-publication-policy.ts';
import { SERVING_WORKERS } from './serving-workers-apps.mjs';

// Every active production app either publishes automatically on a production
// push or carries a dated, owner-approved exemption. Active apps are the
// planner targets, the production publication policy, the production app
// exclusions and the serving Workers.
export type ProductionPublicationExemption = {
  reason: string;
  owner: string;
  approvedOn: string;
  // The commit that recorded the decision, or 'none' when no review exists.
  source: string;
};

export type PublicationRoute = 'planner' | 'serving-workers';

export type AppCoverage = {
  app: string;
  route: PublicationRoute | null;
  gaps: string[];
};

const PLANNER = '.github/workflows/vercel-production.yaml';
const SERVING = '.github/workflows/serving-workers-production.yaml';
const WAVE1_PUBLISHER =
  'uses: ./.github/workflows/wave1-native-production.yaml';
// An owner is a GitHub login or an @org/team handle that can be notified.
// Lane and role labels such as prod-owner name no person, so they are refused
// even though they fit the login shape.
const githubLogin = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
const githubTeam =
  /^@[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const placeholders = new Set(['unassigned', 'none', 'unknown', 'tbd', 'owner']);

export function isNamedOwner(owner: unknown): boolean {
  if (typeof owner !== 'string') return false;
  const lower = owner.toLowerCase();
  if (placeholders.has(lower) || /-(?:owner|lane)$/.test(lower)) return false;
  return githubLogin.test(owner) || githubTeam.test(owner);
}
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function read(rootDir: string, path: string): string {
  const file = join(rootDir, path);
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

function callsWorkflow(caller: string, workflow: string): boolean {
  return caller
    .split('\n')
    .some((line) => line.trim() === `uses: ./.github/workflows/${workflow}`);
}

function hasServingWorkerPublisher(workflow: string, app: string): boolean {
  const jobs = workflow.split('\njobs:\n')[1] ?? '';
  const publish = /^  publish:\n((?: {4}[^\n]*\n|\n)+)/m.exec(jobs + '\n')?.[1];
  if (!publish) return false;
  const needs = /^    needs: \[([^\]]+)\]$/m.exec(publish)?.[1];
  return Boolean(
    new RegExp(`^  build-${app}:$`, 'm').test(jobs) &&
    needs?.split(/,\s*/).includes(`build-${app}`) &&
    callsWorkflow(publish, 'serving-worker-publish.yaml') &&
    publish.includes('fromJSON(needs.plan.outputs.matrix)') &&
    publish.includes('app: ${{ matrix.app }}')
  );
}

export function activeProductionApps(): string[] {
  return [
    ...new Set([
      ...cloudflareProductionTargets.map(({ app }) => app),
      ...Object.keys(productionPublicationPolicy),
      ...Object.keys(productionAppExclusions),
      ...Object.keys(SERVING_WORKERS),
    ]),
  ].sort();
}

export function productionPublicationCoverage(
  rootDir: string,
  apps: readonly string[] = activeProductionApps(),
  exemptions: Record<string, unknown> = productionPublicationExemptions
): AppCoverage[] {
  const planner = read(rootDir, PLANNER);
  const serving = read(rootDir, SERVING);
  const wave1Apps = new Set(
    Object.keys(
      JSON.parse(read(rootDir, 'scripts/ci/wave1-native-profiles.json')).apps ??
        {}
    )
  );
  return apps.map((app) => {
    const gaps: string[] = [];
    const target = cloudflareProductionTargets.find(
      (entry) => entry.app === app
    );
    const hold = productionPublicationHold(
      target?.productionWorkflow ?? `${app}-cloudflare.yaml`,
      { automatic: true, exemptions }
    );
    if (hold) gaps.push(hold);
    let route: PublicationRoute | null = null;
    if (target) {
      if (!callsWorkflow(planner, target.productionWorkflow)) {
        gaps.push('the planner selects it but has no job that calls it');
      } else if (
        wave1Apps.has(app) &&
        !read(rootDir, `.github/workflows/${target.productionWorkflow}`)
          .split('\n')
          .some((line) => line.trim() === WAVE1_PUBLISHER)
      ) {
        gaps.push('its workflow never calls wave1-native-production.yaml');
      } else if (!hold) {
        route = 'planner';
      }
    } else if (Object.hasOwn(SERVING_WORKERS, app)) {
      if (!hasServingWorkerPublisher(serving, app)) {
        gaps.push('serving-workers-production.yaml has no publish matrix leg');
      } else if (!hold) {
        route = 'serving-workers';
      }
    } else {
      gaps.push('no automatic production publisher exists');
    }
    return { app, route, gaps: route ? [] : gaps };
  });
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !isoDate.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

/**
 * Problems with the exemption records; empty when coverage is complete. The
 * result never depends on the current date: a record fails only when it is
 * missing, unowned, undated or malformed.
 */
export function productionPublicationCoverageProblems({
  rootDir,
  exemptions = productionPublicationExemptions,
  apps,
}: {
  rootDir: string;
  exemptions?: Record<string, unknown>;
  apps?: readonly string[];
}): string[] {
  const problems: string[] = [];
  const coverage = productionPublicationCoverage(rootDir, apps, exemptions);
  const known = new Set(coverage.map(({ app }) => app));
  for (const { app, route, gaps } of coverage) {
    if (!route && !Object.hasOwn(exemptions, app)) {
      problems.push(
        `${app}: excluded from production publication without an exemption (${gaps.join('; ')})`
      );
    }
  }
  for (const [app, value] of Object.entries(exemptions)) {
    if (!known.has(app)) {
      problems.push(`${app}: exemption for an unknown production app`);
      continue;
    }
    const entry = (value ?? {}) as Partial<ProductionPublicationExemption>;
    const keys = Object.keys(entry).sort().join();
    if (keys !== 'approvedOn,owner,reason,source') {
      problems.push(
        `${app}: exemption needs exactly reason, owner, approvedOn and source`
      );
      continue;
    }
    for (const field of ['reason', 'owner', 'source'] as const) {
      const text = entry[field];
      if (typeof text !== 'string' || !text.trim() || /[\r\n]/.test(text))
        problems.push(`${app}: exemption ${field} must be one non-empty line`);
    }
    if (typeof entry.owner === 'string' && !isNamedOwner(entry.owner))
      problems.push(
        `${app}: exemption owner must be a GitHub login or @org/team handle`
      );
    if (
      typeof entry.source === 'string' &&
      entry.source !== 'none' &&
      !/^[a-f0-9]{10,40}$/.test(entry.source)
    )
      problems.push(`${app}: exemption source must be a commit SHA or none`);
    if (!isCalendarDate(entry.approvedOn))
      problems.push(`${app}: exemption approvedOn must be a YYYY-MM-DD date`);
  }
  return problems;
}
