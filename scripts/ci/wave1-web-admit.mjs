// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: Direct CI entrypoint; credentials never enter Turbo builds.
// Credential-free admission for the staging Web publisher: the exact SHA is
// admitted by WAVE1_STAGING_PUBLICATION_ADMISSION and its Web Start candidate
// qualification (`web-start-candidate.yaml` job `candidate`) passed at that
// SHA. Protected jobs re-read the fence and admission freshly before writing.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { stagingAdmission } from './wave1-native-admission.mjs';
import { boundedJson } from './wave1-native-publish.mjs';

export async function admit({ env, sha, fetcher = fetch }) {
  assert.match(sha ?? '', /^[a-f0-9]{40}$/u, 'Exact source SHA required');
  stagingAdmission(env.PUBLICATION_ADMISSION, 'web', sha);
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  admit({ env: process.env, sha: process.argv[2] })
    .then(({ candidateRuns }) =>
      console.log(
        `Admitted ${process.argv[2]} (${candidateRuns} candidate run(s))`
      )
    )
    .catch((error) => {
      console.error(
        error instanceof Error ? error.message : 'Web staging admission failed'
      );
      process.exitCode = 1;
    });
