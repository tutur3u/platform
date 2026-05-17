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
  const repository = process.env.GITHUB_REPOSITORY;

  if (!token || !repository || !refName) {
    return null;
  }

  const apiBase = process.env.GITHUB_API_URL ?? 'https://api.github.com';
  const environment = getVercelDeploymentEnvironment(workflowName);
  const deploymentsUrl = new URL(
    `/repos/${repository}/deployments`,
    apiBase.endsWith('/') ? apiBase : `${apiBase}/`
  );
  deploymentsUrl.searchParams.set('environment', environment);
  deploymentsUrl.searchParams.set('per_page', '30');

  const deployments = await githubJson<GithubDeployment[]>({
    token,
    url: deploymentsUrl.toString(),
  });

  for (const deployment of deployments ?? []) {
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
    const latestStatus = statuses?.[0];

    if (latestStatus?.state === 'success') {
      return deployment.sha;
    }
  }

  return null;
}
