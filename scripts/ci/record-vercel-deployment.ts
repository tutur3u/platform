type GithubDeployment = {
  id: number;
  statuses_url: string;
};

type MarkerKind = 'build' | 'deployment';

function getEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getWorkflowName(): string {
  return (
    process.env.VERCEL_WORKFLOW_NAME ??
    process.env.WORKFLOW_NAME ??
    process.env.GITHUB_WORKFLOW_REF?.split('/').pop() ??
    ''
  );
}

function getDeploymentEnvironment(workflowName: string): string {
  if (!/^vercel-(preview|production)-.+\.ya?ml$/.test(workflowName)) {
    throw new Error(
      `Expected a Vercel workflow filename, received "${workflowName}".`
    );
  }

  return workflowName.replace(/\.ya?ml$/, '');
}

function getMarkerKind(): MarkerKind {
  const markerKind = process.env.VERCEL_MARKER_KIND ?? 'deployment';

  if (markerKind !== 'build' && markerKind !== 'deployment') {
    throw new Error(
      `Expected VERCEL_MARKER_KIND to be "build" or "deployment", received "${markerKind}".`
    );
  }

  return markerKind;
}

async function githubJson<T>({
  body,
  method,
  token,
  url,
}: {
  body?: unknown;
  method: 'POST';
  token: string;
  url: string;
}): Promise<T> {
  const response = await fetch(url, {
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    method,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(
      `GitHub API request failed (${response.status}): ${message}`
    );
  }

  return (await response.json()) as T;
}

async function main() {
  const token = getEnv('GITHUB_TOKEN');
  const repository = getEnv('GITHUB_REPOSITORY');
  const sha = process.env.VERCEL_MARKER_SHA ?? getEnv('GITHUB_SHA');
  const workflowName = getWorkflowName();
  const markerKind = getMarkerKind();
  const environment = getDeploymentEnvironment(workflowName);
  const apiBase = process.env.GITHUB_API_URL ?? 'https://api.github.com';
  const runUrl = `${process.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${repository}/actions/runs/${process.env.GITHUB_RUN_ID ?? ''}`;
  const deploymentsUrl = new URL(
    `/repos/${repository}/deployments`,
    apiBase.endsWith('/') ? apiBase : `${apiBase}/`
  );

  const deployment = await githubJson<GithubDeployment>({
    body: {
      auto_merge: false,
      description: `Successful ${workflowName} ${markerKind} marker`,
      environment,
      payload: {
        markerKind,
        ref: process.env.GITHUB_REF ?? '',
        refName: process.env.GITHUB_REF_NAME ?? '',
        runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? '',
        runId: process.env.GITHUB_RUN_ID ?? '',
        runUrl,
        sha,
        workflowName,
      },
      production_environment: workflowName.startsWith('vercel-production-'),
      ref: sha,
      required_contexts: [],
      transient_environment: workflowName.startsWith('vercel-preview-'),
    },
    method: 'POST',
    token,
    url: deploymentsUrl.toString(),
  });

  await githubJson({
    body: {
      auto_inactive: false,
      description: `Recorded successful ${workflowName} ${markerKind}`,
      environment,
      log_url: runUrl,
      state: 'success',
    },
    method: 'POST',
    token,
    url: deployment.statuses_url,
  });

  console.log(
    `Recorded ${environment} ${markerKind} marker for ${sha.slice(0, 12)}.`
  );
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
