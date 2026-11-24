import { provisionActors } from './actors';
import { Ledger } from './ledger';
import { readRunConfig, required } from './policy';
import { githubOidcAuth, tuturuuuQaClient } from './tuturuuu-qa';
import { upskiiProvisioner } from './upskii';

/** Provision the run's QA actors; every owner is in the ledger first. */
export default async function globalSetup() {
  const config = readRunConfig(process.env);
  await provisionActors(config, new Ledger(config.ledgerPath), {
    tuturuuu: tuturuuuQaClient(githubOidcAuth(process.env)),
    upskii: upskiiProvisioner(
      required(process.env, 'UPSKII_QA_PROVISIONER_TOKEN')
    ),
  });
}
