import { forgetActors } from './actors';
import { cleanup } from './cleanup';
import { Ledger } from './ledger';
import { readRunConfig, required } from './policy';
import { githubOidcAuth, tuturuuuQaClient } from './tuturuuu-qa';
import { upskiiProvisioner } from './upskii';

/**
 * First cleanup pass, in-process. The workflow runs `cli.ts cleanup` and
 * `cli.ts verify` again with `if: always()`, which also covers a crash that
 * skips this teardown.
 */
export default async function globalTeardown() {
  const config = readRunConfig(process.env);
  try {
    const failures = await cleanup(new Ledger(config.ledgerPath), {
      tuturuuu: tuturuuuQaClient(githubOidcAuth(process.env)),
      upskii: upskiiProvisioner(
        required(process.env, 'UPSKII_QA_PROVISIONER_TOKEN')
      ),
    });
    for (const failure of failures) console.warn(`cleanup: ${failure}`);
  } finally {
    forgetActors(config);
  }
}
