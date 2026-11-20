import { appendFileSync } from 'node:fs';
import {
  ci,
  productionAppExclusions,
  productionPublicationPolicy,
} from '../../tuturuuu.ci.ts';
import {
  cloudflareProductionTargets,
  vercelProductionWorkflowTargets,
  vercelWorkflowTargets,
} from '../../tuturuuu.ts';

const protectedSurfaces = {
  lms: ['frontend'],
  forms: ['frontend'],
  inventory: ['frontend'],
  nova: ['frontend'],
  mind: ['frontend'],
  finance: ['frontend'],
  mastermind: ['frontend'],
  meet: ['frontend', 'realtime-do'],
  calendar: ['frontend'],
  mail: ['frontend'],
  apps: ['frontend'],
  workspace: ['frontend'],
  git: ['frontend'],
  // Wave 2: held until a reviewed Start + Void cutover admits it.
  shortener: ['frontend'],
  contacts: ['frontend'],
} as const;

type ProtectedApp = keyof typeof protectedSurfaces;
type PublicationEntry =
  | { state: 'held'; reason: string }
  | { state: 'admitted'; reason: string; surfaces: readonly string[] };
export type ProductionPublicationPolicy = Record<
  ProtectedApp,
  PublicationEntry
>;

const protectedWorkflows = new Map<string, string>();
for (const app of Object.keys(protectedSurfaces)) {
  // The native aliases remain protected before a publisher is added to the inventory.
  protectedWorkflows.set(`vercel-production-${app}.yaml`, app);
  protectedWorkflows.set(`${app}-cloudflare.yaml`, app);
}
const retiredVercelWorkflows = new Set(
  vercelWorkflowTargets
    .filter(({ productionWorkflow }) => productionWorkflow === null)
    .map(({ app }) => `vercel-production-${app}.yaml`)
);
const knownWorkflows = new Set<string>(
  [...vercelProductionWorkflowTargets, ...cloudflareProductionTargets].map(
    ({ productionWorkflow }) => productionWorkflow
  )
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Dependency-free so direct publishers can validate before installing packages.
export function validateProductionPublicationPolicy(policy: unknown) {
  if (
    !isRecord(policy) ||
    Object.keys(policy).length !== Object.keys(protectedSurfaces).length
  ) {
    throw new Error('Expected exactly the protected publication records');
  }
  const entries = new Map<string, PublicationEntry>();
  for (const [app, requiredSurfaces] of Object.entries(protectedSurfaces)) {
    const entry = Object.hasOwn(policy, app) ? policy[app] : undefined;
    if (
      !isRecord(entry) ||
      !Object.hasOwn(entry, 'state') ||
      !Object.hasOwn(entry, 'reason') ||
      typeof entry.reason !== 'string' ||
      !entry.reason.trim() ||
      /[\r\n]/.test(entry.reason)
    ) {
      throw new Error(`Missing or malformed publication record: ${app}`);
    }
    const surfaces = entry.surfaces;
    if (entry.state === 'held' && Object.keys(entry).length === 2) {
      entries.set(app, { state: 'held', reason: entry.reason });
    } else if (
      entry.state === 'admitted' &&
      Object.hasOwn(entry, 'surfaces') &&
      Object.keys(entry).length === 3 &&
      Array.isArray(surfaces) &&
      surfaces.length === requiredSurfaces.length &&
      requiredSurfaces.every((surface) => surfaces.includes(surface))
    ) {
      entries.set(app, {
        state: 'admitted',
        reason: entry.reason,
        surfaces: [...requiredSurfaces],
      });
    } else {
      throw new Error(`Invalid publication state or surfaces: ${app}`);
    }
  }
  return entries;
}

/**
 * A publisher switched off in the tuturuuu.ci.ts workflow switchboard never
 * publishes, including on a manual dispatch the switchboard does not gate.
 */
function switchboardHold(workflowName: string): string | undefined {
  const switchboard: Record<string, boolean> = ci;
  if (!Object.hasOwn(switchboard, workflowName)) return undefined;
  if (switchboard[workflowName] !== false) return undefined;
  return 'held: publisher disabled in the tuturuuu.ci.ts switchboard';
}

function exclusionHold(workflowName: string): string | undefined {
  const app =
    [...vercelProductionWorkflowTargets, ...cloudflareProductionTargets].find(
      (entry) => entry.productionWorkflow === workflowName
    )?.app ?? protectedWorkflows.get(workflowName);
  if (!app || !Object.hasOwn(productionAppExclusions, app)) return undefined;
  const reason = productionAppExclusions[app];
  if (typeof reason !== 'string' || !reason.trim() || /[\r\n]/.test(reason)) {
    return 'held: malformed production app exclusion';
  }
  return reason;
}

export function productionPublicationHold(
  workflowName: string
): string | undefined {
  if (retiredVercelWorkflows.has(workflowName))
    return 'held: Vercel production publisher retired';
  // The app-id deny-list wins over admission, markers, and dispatch.
  const excluded = exclusionHold(workflowName);
  if (excluded) return excluded;
  const app = protectedWorkflows.get(workflowName);
  if (!app) {
    return knownWorkflows.has(workflowName)
      ? switchboardHold(workflowName)
      : 'held for wave-1 cutover: unknown production workflow';
  }
  try {
    const entry = validateProductionPublicationPolicy(
      productionPublicationPolicy
    ).get(app);
    if (entry?.state === 'admitted') return switchboardHold(workflowName);
    return entry?.reason ?? 'held for wave-1 cutover: missing admission';
  } catch {
    return 'held for wave-1 cutover: invalid or incomplete publication policy';
  }
}

if (import.meta.main) {
  const workflowName = process.argv[2];
  if (!workflowName) throw new Error('Expected production workflow name');
  const reason = productionPublicationHold(workflowName);
  const message = `${workflowName}: ${reason ?? 'publication admitted by source policy'}`;
  console.log(message);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `allowed=${reason === undefined}\n`
    );
  }
  const summaryPath = process.argv[3];
  if (summaryPath) {
    appendFileSync(
      summaryPath,
      `## Production publication policy\n\n${message}\n`
    );
  }
}
