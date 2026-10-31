// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: Direct CI entrypoint; credentials never enter Turbo builds.
// Credential-free admission for the staging Web publisher: the exact SHA is
// admitted by WEB_STAGING_NEXT_ADMISSION and its Web Start candidate
// qualification (`web-start-candidate.yaml` job `candidate`) passed at that
// SHA. Protected jobs re-read the fence and admission freshly before writing.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { parseDryRunArgs } from './dry-run-args.mjs';
import { boundedJson } from './wave1-native-publish.mjs';
import { nextAdmission } from './wave1-web-next.mjs';

export async function admit({ env, sha, fetcher = fetch }) {
  assert.match(sha ?? '', /^[a-f0-9]{40}$/u, 'Exact source SHA required');
  nextAdmission(env.NEXT_ADMISSION, sha);
  const runs = await boundedJson(
    `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/commits/${sha}/check-runs?check_name=candidate&per_page=20`,
    env.GH_TOKEN,
    fetcher
  );
  const candidate = (runs.check_runs ?? []).filter(
    (run) => run.name === 'candidate' && run.head_sha === sha
  );
  assert.ok(
    candidate.length > 0,
    'Web Start candidate has not qualified this SHA'
  );
  assert.ok(
    candidate.every(
      (run) => run.status === 'completed' && run.conclusion === 'success'
    ),
    'Web Start candidate qualification is not green at this SHA'
  );
  return { candidateRuns: candidate.length };
}

// Prints the intended actions without any network access (`--dry-run`).
export function describeAdmitPlan({ sha }) {
  assert.match(sha ?? '', /^[a-f0-9]{40}$/u, 'Exact source SHA required');
  return [
    `[dry-run] Would admit ${sha} for the staging Web publisher:`,
    '  1. verify NEXT_ADMISSION names this SHA',
    `  2. GET https://api.github.com/repos/$GITHUB_REPOSITORY/commits/${sha}/check-runs?check_name=candidate&per_page=20`,
    '  3. require every "candidate" run at this SHA to be completed/success',
    '[dry-run] No request was made.',
  ];
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const cli = parseDryRunArgs(process.argv.slice(2));
  if (cli.dryRun) {
    try {
      for (const line of describeAdmitPlan({ sha: cli.args[0] }))
        console.log(line);
    } catch (error) {
      console.error(
        error instanceof Error ? error.message : 'Web staging admission failed'
      );
      process.exitCode = 1;
    }
  } else
    admit({ env: process.env, sha: process.argv[2] })
      .then(({ candidateRuns }) =>
        console.log(
          `Admitted ${process.argv[2]} (${candidateRuns} candidate run(s))`
        )
      )
      .catch((error) => {
        console.error(
          error instanceof Error
            ? error.message
            : 'Web staging admission failed'
        );
        process.exitCode = 1;
      });
}
