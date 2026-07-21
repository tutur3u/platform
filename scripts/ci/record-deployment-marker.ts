type GithubDeployment = {
  statuses_url: string;
};

function getEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getOptionalEnv(name: string): string | undefined {
  return process.env[name];
}

async function githubPost<T>({
  body,
  token,
  url,
}: {
  body: unknown;
  token: string;
  url: string;
}): Promise<T> {
  const response = await fetch(url, {
    body: JSON.stringify(body),
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    method: 'POST',
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
  const sha = getEnv('DEPLOYMENT_MARKER_SHA');
  const workflowName = getEnv('DEPLOYMENT_MARKER_WORKFLOW_NAME');
  const environment =
    getOptionalEnv('DEPLOYMENT_MARKER_ENVIRONMENT') ??
    workflowName.replace(/\.ya?ml$/, '');
  const refName =
    getOptionalEnv('DEPLOYMENT_MARKER_REF_NAME') ??
    process.env.GITHUB_REF_NAME ??
    '';
  const apiBase = process.env.GITHUB_API_URL ?? 'https://api.github.com';
  const runUrl = `${process.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${repository}/actions/runs/${process.env.GITHUB_RUN_ID ?? ''}`;
  const deploymentsUrl = new URL(
    `/repos/${repository}/deployments`,
    apiBase.endsWith('/') ? apiBase : `${apiBase}/`
  );
  const isProduction = environment.includes('production');

  const deployment = await githubPost<GithubDeployment>({
    body: {
      auto_merge: false,
      description: `Successful ${workflowName} deployment marker`,
      environment,
      payload: {
        markerKind: 'deployment',
        ref: process.env.GITHUB_REF ?? '',
        refName,
        runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? '',
        runId: process.env.GITHUB_RUN_ID ?? '',
        runUrl,
        sha,
        workflowName,
      },
      production_environment: isProduction,
      ref: sha,
      required_contexts: [],
      transient_environment: !isProduction,
    },
    token,
    url: deploymentsUrl.toString(),
  });

  await githubPost({
    body: {
      auto_inactive: false,
      description: `Recorded successful ${workflowName} deployment`,
      environment,
      log_url: runUrl,
      state: 'success',
    },
    token,
    url: deployment.statuses_url,
  });

  console.log(
    `Recorded ${environment} deployment marker for ${sha.slice(0, 12)}.`
  );
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
