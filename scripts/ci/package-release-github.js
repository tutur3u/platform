const DEFAULT_GITHUB_API_URL = 'https://api.github.com';
const FAILED_WORKFLOW_CONCLUSIONS = new Set([
  'action_required',
  'cancelled',
  'failure',
  'startup_failure',
  'timed_out',
]);

function getGitHubToken(env = process.env) {
  return env.GH_TOKEN || env.GITHUB_TOKEN || '';
}

function buildWorkflowRunsUrl({ env = process.env, workflowName }) {
  if (!env.GITHUB_REPOSITORY || !workflowName) return null;

  const apiUrl = (env.GITHUB_API_URL || DEFAULT_GITHUB_API_URL).replace(
    /\/$/u,
    ''
  );
  const params = new URLSearchParams({
    per_page: '20',
  });

  if (env.GITHUB_REF_NAME) {
    params.set('branch', env.GITHUB_REF_NAME);
  }

  return `${apiUrl}/repos/${env.GITHUB_REPOSITORY}/actions/workflows/${encodeURIComponent(workflowName)}/runs?${params}`;
}

function getWorkflowDispatchRef(env = process.env) {
  if (env.GITHUB_REF_NAME) return env.GITHUB_REF_NAME;

  const ref = env.GITHUB_REF;

  if (ref?.startsWith('refs/heads/')) {
    return ref.slice('refs/heads/'.length);
  }

  return null;
}

function buildWorkflowDispatchUrl({ env = process.env, workflowName }) {
  if (!env.GITHUB_REPOSITORY || !workflowName) return null;

  const apiUrl = (env.GITHUB_API_URL || DEFAULT_GITHUB_API_URL).replace(
    /\/$/u,
    ''
  );

  return `${apiUrl}/repos/${env.GITHUB_REPOSITORY}/actions/workflows/${encodeURIComponent(workflowName)}/dispatches`;
}

async function getRelatedWorkflowRunStatus({
  env = process.env,
  fetchImpl = globalThis.fetch,
  logger = console,
  workflowName,
}) {
  const url = buildWorkflowRunsUrl({ env, workflowName });
  const token = getGitHubToken(env);

  if (!url || !env.GITHUB_SHA || !token || typeof fetchImpl !== 'function') {
    return { state: 'unknown' };
  }

  try {
    const response = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'tuturuuu-package-release-readiness',
      },
    });

    if (!response.ok) {
      logger.log(
        `Unable to inspect ${workflowName} release workflow status: ` +
          `${response.status} ${response.statusText}`
      );
      return { state: 'unknown' };
    }

    const payload = await response.json();
    const workflowRun = (payload.workflow_runs ?? [])
      .filter((run) => run.head_sha === env.GITHUB_SHA)
      .sort((left, right) =>
        String(right.run_started_at ?? '').localeCompare(
          String(left.run_started_at ?? '')
        )
      )[0];

    if (!workflowRun) {
      return { state: 'missing' };
    }

    if (workflowRun.status === 'completed') {
      if (workflowRun.conclusion === 'success') {
        return {
          state: 'success',
          url: workflowRun.html_url,
        };
      }

      if (FAILED_WORKFLOW_CONCLUSIONS.has(workflowRun.conclusion)) {
        return {
          conclusion: workflowRun.conclusion,
          state: 'failed',
          url: workflowRun.html_url,
        };
      }
    }

    return {
      state: 'pending',
      status: workflowRun.status,
      url: workflowRun.html_url,
    };
  } catch (error) {
    logger.log(
      `Unable to inspect ${workflowName} release workflow status: ${error.message}`
    );
    return { state: 'unknown' };
  }
}

async function dispatchRelatedWorkflow({
  env = process.env,
  fetchImpl = globalThis.fetch,
  logger = console,
  skipDisabled = false,
  workflowName,
}) {
  const url = buildWorkflowDispatchUrl({ env, workflowName });
  const token = getGitHubToken(env);
  const ref = getWorkflowDispatchRef(env);

  if (!url || !token || !ref || typeof fetchImpl !== 'function') {
    throw new Error(
      `Unable to dispatch ${workflowName}: missing GitHub repository, token, ref, or fetch implementation.`
    );
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'tuturuuu-package-release-readiness',
  };

  if (skipDisabled) {
    const workflow = await fetchImpl(url.slice(0, -'/dispatches'.length), {
      headers,
      method: 'GET',
    });
    if (!workflow.ok) {
      throw new Error(
        `Unable to inspect ${workflowName} workflow state: ${workflow.status} ${workflow.statusText}.`
      );
    }
    const { state } = await workflow.json();
    if (state === 'disabled_manually') {
      logger.log(`Skipping disabled dependent workflow ${workflowName}.`);
      return { ref, state: 'disabled' };
    }
    if (state !== 'active') {
      throw new Error(`Unable to confirm ${workflowName} workflow state.`);
    }
  }

  const response = await fetchImpl(url, {
    body: JSON.stringify({
      ref,
    }),
    headers,
    method: 'POST',
  });

  if (!response.ok) {
    let body = '';

    try {
      body = await response.text();
    } catch {
      body = '';
    }

    throw new Error(
      `Unable to dispatch ${workflowName} on ${ref}: ` +
        `${response.status} ${response.statusText}${body ? ` ${body}` : ''}. ` +
        'Ensure the workflow has workflow_dispatch enabled and this job has actions: write permission.'
    );
  }

  logger.log(`Dispatched ${workflowName} on ${ref}.`);

  return {
    ref,
    state: 'dispatched',
  };
}

module.exports = {
  DEFAULT_GITHUB_API_URL,
  FAILED_WORKFLOW_CONCLUSIONS,
  getGitHubToken,
  buildWorkflowRunsUrl,
  getWorkflowDispatchRef,
  buildWorkflowDispatchUrl,
  getRelatedWorkflowRunStatus,
  dispatchRelatedWorkflow,
};
