import { stripVTControlCharacters } from 'node:util';
import { sandboxDocker } from './devbox-sandbox-process';

/** Only disposable, explicitly opted-in CI pools retain bounded startup logs. */
export function syntheticContainerLoggingArgs(pool: string, enabled: boolean) {
  return enabled && /^ci-[0-9]+-[0-9]+$/.test(pool)
    ? ['--log-driver=local', '--log-opt=max-size=8k', '--log-opt=max-file=1']
    : [];
}

/** Opt-in CI fixture only: PID 1 logs, never config, env or project exports. */
export async function collectSyntheticContainerLogs(
  id: string,
  docker: typeof sandboxDocker = sandboxDocker
) {
  if (!/^[a-f0-9]{12,64}$/.test(id))
    throw new Error('Invalid owned container ID');
  const logs = await docker(['logs', '--tail', '20', id], '', 5000, 2048);
  return {
    code: logs.code,
    timedOut: logs.timedOut,
    exceeded: logs.exceeded,
    output: stripVTControlCharacters(logs.output).slice(0, 2048),
    stderr: stripVTControlCharacters(logs.stderr).slice(0, 2048),
  };
}
