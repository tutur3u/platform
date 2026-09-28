import type { TuturuuuUserClient } from '../platform';
import { type FlagValue, getFlag } from './args';
import { getJudgeReadiness } from './devbox-judge-sandbox';
import { defaultDevboxSetupRunCommand } from './devbox-setup-command';
import {
  type DevboxServiceManager,
  getDevboxRunnerDashboardUrl,
  setupDevboxRunner,
} from './devbox-setup-service';

export async function runDevboxConnect({
  client,
  flags,
  json,
}: {
  client: TuturuuuUserClient;
  flags: Record<string, FlagValue>;
  json: boolean;
}) {
  const serviceManager = getFlag(flags, 'service-manager');
  if (
    serviceManager &&
    !['auto', 'launchd', 'systemd'].includes(serviceManager)
  ) {
    throw new Error('Invalid --service-manager value.');
  }
  const judgeImages = getFlag(flags, 'judge-images');
  if (judgeImages) {
    const readiness = await getJudgeReadiness(judgeImages);
    if (!readiness.ready) {
      throw new Error(readiness.reason ?? 'Judge is not ready.');
    }
  }
  const result = await setupDevboxRunner({
    checkoutDir: process.cwd(),
    options: {
      agent: true,
      client,
      judgeImages,
      json,
      runCommand: defaultDevboxSetupRunCommand,
      runnerName: getFlag(flags, 'runner-name'),
      service: flags.service === true,
      serviceManager: serviceManager as DevboxServiceManager | undefined,
      serviceUser: getFlag(flags, 'service-user'),
      tokenFile: getFlag(flags, 'token-file'),
    },
  });
  if (!result) throw new Error('Runner registration was cancelled.');
  const dashboardUrl = getDevboxRunnerDashboardUrl(result.runner.id);
  if (json)
    process.stdout.write(
      `${JSON.stringify({ ...result, dashboardUrl }, null, 2)}\n`
    );
  else
    process.stdout.write(
      `Runner ${result.runner.name} connected.\nToken file: ${result.tokenFile}\nVerify and manage it: ${dashboardUrl}\n${result.service ? '' : 'Start the agent after sourcing the token file, or reconnect with --service.\n'}`
    );
}
