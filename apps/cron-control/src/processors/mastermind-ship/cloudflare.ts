import {
  isoOrNull,
  type RequestBudget,
  type ShipFetchDeps,
  ShipSourceError,
  shipFetch,
} from './http';
import type { ShipCollectorState, ShipWorker } from './snapshot';

// Active Cloudflare Worker version per script: one deployments read per
// script, plus one version read the first time a version id is seen (its
// message or tag carries the release SHA). Needs
// MASTERMIND_SHIP_CLOUDFLARE_TOKEN (Account, Workers Scripts Read).

export interface CloudflareShipEnv {
  CLOUDFLARE_ACCOUNT_ID?: string;
  MASTERMIND_SHIP_CLOUDFLARE_TOKEN?: string;
}

const API = 'https://api.cloudflare.com/client/v4/';
const ACCOUNT = /^[0-9a-f]{32}$/u;
const SCRIPT = /^[a-z0-9][a-z0-9-]{0,62}$/u;
const VERSION = /^[0-9a-f-]{8,64}$/u;
const SHA_IN_TEXT = /\b[0-9a-f]{40}\b/u;

export function cloudflareConfigured(env: CloudflareShipEnv) {
  return (
    ACCOUNT.test(env.CLOUDFLARE_ACCOUNT_ID ?? '') &&
    (env.MASTERMIND_SHIP_CLOUDFLARE_TOKEN?.trim().length ?? 0) >= 20
  );
}

function shaFrom(annotations: unknown) {
  if (!annotations || typeof annotations !== 'object') return null;
  for (const key of ['workers/tag', 'workers/message']) {
    const text = (annotations as Record<string, unknown>)[key];
    const match = typeof text === 'string' ? SHA_IN_TEXT.exec(text) : null;
    if (match) return match[0];
  }
  return null;
}

function result(json: unknown) {
  return json &&
    typeof json === 'object' &&
    'success' in json &&
    json.success === true &&
    'result' in json
    ? (json.result as Record<string, unknown> | null)
    : null;
}

/** Reads one script's active version; `versions` caches version facts. */
export async function readWorker(
  env: CloudflareShipEnv,
  deps: ShipFetchDeps,
  budget: RequestBudget,
  script: string,
  versions: ShipCollectorState['versions']
): Promise<ShipWorker | null> {
  if (!SCRIPT.test(script)) throw new ShipSourceError('invalid');
  const headers = {
    Authorization: `Bearer ${env.MASTERMIND_SHIP_CLOUDFLARE_TOKEN!.trim()}`,
  };
  const base = new URL(
    `accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${script}/`,
    API
  );
  const listed = await shipFetch(deps, budget, new URL('deployments', base), {
    method: 'GET',
    headers,
  });
  const deployments =
    listed.status === 200 ? result(listed.json)?.deployments : null;
  if (!Array.isArray(deployments)) throw new ShipSourceError('invalid');
  // Cloudflare lists the deployment serving traffic first.
  const active = deployments[0] as Record<string, unknown> | undefined;
  if (!active) return null;
  const split = Array.isArray(active.versions)
    ? (active.versions as Record<string, unknown>[])
    : [];
  const top = split
    .filter(
      (version) =>
        typeof version.version_id === 'string' &&
        VERSION.test(version.version_id) &&
        typeof version.percentage === 'number'
    )
    .sort((a, b) => (b.percentage as number) - (a.percentage as number))[0];
  const deployedAt = isoOrNull(active.created_on);
  if (!top || !deployedAt) throw new ShipSourceError('invalid');
  const versionId = top.version_id as string;
  let cached = versions[versionId];
  if (!cached) {
    const read = await shipFetch(
      deps,
      budget,
      new URL(`versions/${versionId}`, base),
      { method: 'GET', headers }
    );
    const version = read.status === 200 ? result(read.json) : null;
    if (!version) throw new ShipSourceError('invalid');
    const metadata = (version.metadata ?? {}) as Record<string, unknown>;
    cached = {
      sha: shaFrom(version.annotations) ?? shaFrom(active.annotations),
      createdAt: isoOrNull(metadata.created_on) ?? deployedAt,
    };
    versions[versionId] = cached;
  }
  return {
    script,
    versionId,
    percentage: Math.round((top.percentage as number) * 100) / 100,
    deployedAt,
    sha: cached.sha,
  };
}
