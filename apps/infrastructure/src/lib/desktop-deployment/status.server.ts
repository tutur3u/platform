import 'server-only';
import {
  DESKTOP_REPO,
  parseDesktopJobs,
  parseDesktopPackages,
  parseDesktopRun,
} from './status';

async function readPublicMetadata(path: string): Promise<unknown | null> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${DESKTOP_REPO}/${path}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
        cache: 'no-store',
      }
    );
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

export async function getDesktopDeploymentStatus() {
  const [releases, runs] = await Promise.all([
    readPublicMetadata('releases?per_page=100'),
    readPublicMetadata(
      'actions/workflows/desktop-beta.yaml/runs?branch=production&per_page=1'
    ),
  ]);
  const candidate =
    typeof runs === 'object' &&
    runs !== null &&
    'workflow_runs' in runs &&
    Array.isArray(runs.workflow_runs)
      ? runs.workflow_runs[0]
      : null;
  const run = parseDesktopRun(candidate);
  const jobsResponse = run
    ? await readPublicMetadata(`actions/runs/${run.id}/jobs?per_page=100`)
    : null;
  return {
    run,
    packages: parseDesktopPackages(releases),
    jobs: parseDesktopJobs(jobsResponse),
    releasesAvailable: Array.isArray(releases),
    jobsAvailable: jobsResponse !== null,
  };
}
