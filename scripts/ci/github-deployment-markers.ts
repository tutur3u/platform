import { appendFileSync } from 'node:fs';

type GithubDeployment = {
  id: number;
  payload?: unknown;
  ref?: string;
  sha?: string;
  statuses_url?: string;
};

type GithubDeploymentStatus = {
  state?: string;
};

type MarkerKind = 'build' | 'deployment';

type SuccessfulDeploymentMarkerInput = {
  markerKind?: MarkerKind;
  sha: string;
  workflowName: string;
};

function parsePayload(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }

  if (typeof payload !== 'string' || payload.length === 0) {
    return {};
  }

  try {
    const parsed = JSON.parse(payload);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

async function githubJson<T>({
  token,
  url,
}: {
  token: string;
  url: string;
}): Promise<T | null> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    console.warn(
      `GitHub API request failed (${response.status}): ${response.statusText}`
    );
    return null;
  }

  return (await response.json()) as T;
}

export function getVercelDeploymentEnvironment(workflowName: string): string {
  return workflowName.replace(/\.ya?ml$/, '');
}

function isPlatformWorkflow(workflowName: string): boolean {
  return /^vercel-(preview|production)-platform\.ya?ml$/.test(workflowName);
}

function markerKindMatches({
  markerKind,
  payload,
  workflowName,
}: {
  markerKind?: MarkerKind;
  payload: Record<string, unknown>;
  workflowName: string;
}): boolean {
  if (!markerKind) {
    return true;
  }

  if (payload.markerKind === markerKind) {
    return true;
  }

  return (
    markerKind === 'build' &&
    isPlatformWorkflow(workflowName) &&
    payload.markerKind === undefined
  );
}

function isSuccessfulStatus(status?: GithubDeploymentStatus): boolean {
  return status?.state === 'success';
}

function hasSuccessfulStatus(statuses?: GithubDeploymentStatus[] | null) {
  return statuses?.some(isSuccessfulStatus) ?? false;
}

async function getDeploymentsForWorkflow({
  workflowName,
}: {
  workflowName: string;
}): Promise<GithubDeployment[]> {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;

  if (!token || !repository) {
    return [];
  }

  const apiBase = process.env.GITHUB_API_URL ?? 'https://api.github.com';
  const environment = getVercelDeploymentEnvironment(workflowName);
  const deploymentsUrl = new URL(
    `/repos/${repository}/deployments`,
    apiBase.endsWith('/') ? apiBase : `${apiBase}/`
  );
  deploymentsUrl.searchParams.set('environment', environment);
  deploymentsUrl.searchParams.set('per_page', '100');

  return (
    (await githubJson<GithubDeployment[]>({
      token,
      url: deploymentsUrl.toString(),
    })) ?? []
  );
}

export async function hasSuccessfulDeploymentMarker({
  markerKind,
  sha,
  workflowName,
}: SuccessfulDeploymentMarkerInput): Promise<boolean> {
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    return false;
  }

  const deployments = await getDeploymentsForWorkflow({ workflowName });

  for (const deployment of deployments) {
    const payload = parsePayload(deployment.payload);
    const markerWorkflowName = payload.workflowName;
    const payloadSha = payload.sha;

    if (
      typeof markerWorkflowName === 'string' &&
      markerWorkflowName !== workflowName
    ) {
      continue;
    }

    if (deployment.sha !== sha && payloadSha !== sha) {
      continue;
    }

    if (!markerKindMatches({ markerKind, payload, workflowName })) {
      continue;
    }

    if (!deployment.statuses_url) {
      continue;
    }

    const statuses = await githubJson<GithubDeploymentStatus[]>({
      token,
      url: deployment.statuses_url,
    });

    if (hasSuccessfulStatus(statuses)) {
      return true;
    }
  }

  return false;
}

export async function findLastSuccessfulDeploymentSha({
  refName,
  workflowName,
}: {
  refName?: string;
  workflowName: string;
}): Promise<string | null> {
  const markerShaOverride = process.env.VERCEL_DEPLOYMENT_MARKER_SHA;

  if (markerShaOverride) {
    return markerShaOverride;
  }

  const token = process.env.GITHUB_TOKEN;

  if (!token || !refName) {
    return null;
  }

  const deployments = await getDeploymentsForWorkflow({ workflowName });

  for (const deployment of deployments) {
    const payload = parsePayload(deployment.payload);
    const markerWorkflowName = payload.workflowName;
    const markerRefName = payload.refName;

    if (
      typeof markerWorkflowName === 'string' &&
      markerWorkflowName !== workflowName
    ) {
      continue;
    }

    if (typeof markerRefName === 'string' && markerRefName !== refName) {
      continue;
    }

    if (!deployment.sha || !deployment.statuses_url) {
      continue;
    }

    const statuses = await githubJson<GithubDeploymentStatus[]>({
      token,
      url: deployment.statuses_url,
    });
    if (hasSuccessfulStatus(statuses)) {
      return deployment.sha;
    }
  }

  return null;
}

function parseArgs(args: string[]) {
  const parsed: {
    markerKind?: MarkerKind;
    sha?: string;
    workflowName?: string;
  } = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === '--marker-kind' && next) {
      if (next !== 'build' && next !== 'deployment') {
        throw new Error(`Unsupported marker kind "${next}".`);
      }

      parsed.markerKind = next;
      index += 1;
      continue;
    }

    if (arg === '--sha' && next) {
      parsed.sha = next;
      index += 1;
      continue;
    }

    if (arg === '--workflow' && next) {
      parsed.workflowName = next;
      index += 1;
    }
  }

  return parsed;
}

function writeGithubOutput(output: Record<string, string>) {
  const githubOutput = process.env.GITHUB_OUTPUT;

  if (!githubOutput) {
    return;
  }

  appendFileSync(
    githubOutput,
    `${Object.entries(output)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')}\n`
  );
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (command !== 'has-successful-marker') {
    throw new Error(
      'Usage: github-deployment-markers.ts has-successful-marker --workflow <workflow> --sha <sha> [--marker-kind build|deployment]'
    );
  }

  const { markerKind, sha, workflowName } = parseArgs(args);

  if (!sha || !workflowName) {
    throw new Error('Both --workflow and --sha are required.');
  }

  const found = await hasSuccessfulDeploymentMarker({
    markerKind,
    sha,
    workflowName,
  });

  console.log(
    `Successful ${markerKind ?? 'any'} marker for ${workflowName} at ${sha}: ${found}`
  );
  writeGithubOutput({ found: String(found), sha, workflow_name: workflowName });
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
