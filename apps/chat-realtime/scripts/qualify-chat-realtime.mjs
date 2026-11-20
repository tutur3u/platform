#!/usr/bin/env node
// Chat realtime qualification against real users, the Web API and the Worker.
//
//   node apps/chat-realtime/scripts/qualify-chat-realtime.mjs [--phase=<name>]
//
// Phases: `live` (default) checks ticketing, fan-out, isolation, replay,
// revocation and the REST fallback. `stopped` checks an environment whose
// Worker stop fence is set. `disabled` checks a Web API without a Worker
// origin. With QUALIFY_LOCAL=1, `live` also starts the Worker in workerd
// behind QUALIFY_REALTIME_PORT, recovers a lost revocation with the Cron
// Control processor (run under Bun) and drives the stop fence. Output never includes
// identities, IDs, tokens, origins or message text.
import { createReporter, readConfig } from './qualify/env.mjs';
import {
  runDisabledScenarios,
  runSharedScenarios,
  runStoppedScenarios,
} from './qualify/scenarios.mjs';
import { createWebClient, signIn } from './qualify/web.mjs';

const phase =
  process.argv.find((arg) => arg.startsWith('--phase='))?.slice(8) ?? 'live';
if (!['live', 'stopped', 'disabled'].includes(phase)) {
  console.error(`Unknown phase ${phase}`);
  process.exit(2);
}

const report = createReporter();
let worker = null;
try {
  const config = readConfig();
  const web = createWebClient(config);
  const sessions = {};
  await report.step('members and outsider sign in', async () => {
    for (const [key, identity] of Object.entries(config.members)) {
      sessions[key] = await signIn(config, identity);
    }
  });
  const context = { config, report, sessions, web };

  if (phase === 'stopped') await runStoppedScenarios(context);
  if (phase === 'disabled') await runDisabledScenarios(context);
  if (phase === 'live') {
    const local = config.local ? await import('./qualify/local.mjs') : null;
    if (local) worker = await local.startLocalWorker(config);
    await runSharedScenarios(context);
    if (local) {
      await local.runRecoveryScenario(context, worker);
      await local.runStopFenceScenario(context, worker);
    }
  }
  console.log(`qualified ${phase}: ${report.results.length} checks passed`);
} catch (error) {
  if (!report.results.some((result) => !result.ok)) {
    console.error(`qualification setup failed: ${error?.message ?? error}`);
  }
  process.exitCode = 1;
} finally {
  await worker?.close();
}
process.exit(process.exitCode ?? 0);
