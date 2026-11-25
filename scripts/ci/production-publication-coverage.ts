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
  expires: string;
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
const MAX_EXEMPTION_DAYS = 90;
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
  apps: readonly string[] = activeProductionApps()
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
      target?.productionWorkflow ?? `${app}-cloudflare.yaml`
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
      if (!new RegExp(`^  publish-${app}:\\s*$`, 'm').test(serving)) {
        gaps.push('serving-workers-production.yaml has no publish job');
      } else if (!hold) {
        route = 'serving-workers';
      }
    } else {
      gaps.push('no automatic production publisher exists');
    }
    return { app, route, gaps: route ? [] : gaps };
  });
}

function days(from: string, to: string): number {
  return (
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
    86_400_000
  );
}

/** Problems with the exemption records; empty when coverage is complete. */
export function productionPublicationCoverageProblems({
  rootDir,
  today,
  exemptions = productionPublicationExemptions,
  apps,
}: {
  rootDir: string;
  today: string;
  exemptions?: Record<string, unknown>;
  apps?: readonly string[];
}): string[] {
  const problems: string[] = [];
  const coverage = productionPublicationCoverage(rootDir, apps);
  const known = new Set(coverage.map(({ app }) => app));
  for (const { app, route, gaps } of coverage) {
    const exemption = exemptions[app];
    if (route && exemption) {
      problems.push(`${app}: publishes through ${route}; remove its exemption`);
    } else if (!route && !exemption) {
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
    const entry = value as Partial<ProductionPublicationExemption>;
    const keys = Object.keys(entry ?? {})
      .sort()
      .join();
    if (keys !== 'approvedOn,expires,owner,reason,source') {
      problems.push(
        `${app}: exemption needs exactly reason, owner, approvedOn, expires and source`
      );
      continue;
    }
    for (const field of ['reason', 'owner', 'source'] as const) {
      const text = entry[field];
      if (typeof text !== 'string' || !text.trim() || /[\r\n]/.test(text))
        problems.push(`${app}: exemption ${field} must be one non-empty line`);
    }
    if (
      typeof entry.source === 'string' &&
      entry.source !== 'none' &&
      !/^[a-f0-9]{10,40}$/.test(entry.source)
    )
      problems.push(`${app}: exemption source must be a commit SHA or none`);
    const { approvedOn, expires } = entry;
    if (
      typeof approvedOn !== 'string' ||
      typeof expires !== 'string' ||
      !isoDate.test(approvedOn) ||
      !isoDate.test(expires) ||
      Number.isNaN(days(approvedOn, expires))
    ) {
      problems.push(`${app}: exemption dates must be YYYY-MM-DD`);
      continue;
    }
    if (days(approvedOn, today) < 0)
      problems.push(`${app}: exemption approvedOn is in the future`);
    if (days(approvedOn, expires) <= 0)
      problems.push(`${app}: exemption expires before it was approved`);
    if (days(approvedOn, expires) > MAX_EXEMPTION_DAYS)
      problems.push(
        `${app}: exemption lasts more than ${MAX_EXEMPTION_DAYS} days`
      );
    if (days(today, expires) <= 0)
      problems.push(
        `${app}: exemption expired on ${expires}; publish it automatically or renew the exemption with its owner`
      );
  }
  return problems;
}
