import { parseArgs } from './args';
import { CLI_EXIT, CliError } from './cli-contracts';
import {
  CLI_ENVS,
  normalizeCliEnv,
  resolveCliEnv,
  resolveTuturuuuOrigins,
  resolveUpskiiOrigins,
} from './cli-env';
import { readCliConfig, writeCliConfig } from './config';
import { requireMutationGate } from './safety-gate';
import { emitCliError } from './ui/errors';
import { formatTable } from './ui/table';

export interface RunEnvCommandDeps {
  envVars?: Record<string, string | undefined>;
  readConfig?: typeof readCliConfig;
  write?: (chunk: string) => void;
  writeConfig?: typeof writeCliConfig;
  writeErr?: (chunk: string) => void;
}

export function envHelp(): string {
  return [
    'ttr env — inspect or switch the default CLI environment (prod, staging, sandbox, local)',
    '',
    'Usage:',
    '  ttr env [current] [--json]',
    '  ttr env list [--json]',
    '  ttr env use <prod|staging|sandbox|local> [--json]',
    '',
    'Precedence: --env flag > TTR_ENV env var > saved defaultEnv > staging.',
    'Note: `ttr external upskii qa` always requires explicit `--env prod` for production.',
  ].join('\n');
}

export async function runEnvCommand(
  argv: string[],
  deps: RunEnvCommandDeps = {}
): Promise<void> {
  const write = deps.write ?? ((chunk: string) => process.stdout.write(chunk));
  const { flags, positionals } = parseArgs(argv);
  const json = flags.json === true;
  const noColor = flags['no-color'] === true;
  const [action = 'current', target] = positionals;

  if (action === 'help' || flags.help === true || flags.h === true) {
    write(`${envHelp()}\n`);
    return;
  }

  try {
    const readCfg = deps.readConfig ?? readCliConfig;
    const writeCfg = deps.writeConfig ?? writeCliConfig;
    const config = await readCfg();
    const activeEnv = resolveCliEnv({
      configuredEnv: config.defaultEnv,
      defaultEnv: 'staging',
      env: deps.envVars,
    });

    if (action === 'current') {
      const payload = {
        activeEnv,
        configuredEnv: config.defaultEnv ?? null,
        processEnvOverride: (deps.envVars ?? process.env).TTR_ENV ?? null,
        tuturuuu: resolveTuturuuuOrigins(activeEnv, deps.envVars),
        upskii: resolveUpskiiOrigins(activeEnv, deps.envVars),
      };
      if (json) {
        write(`${JSON.stringify(payload, null, 2)}\n`);
        return;
      }
      write(
        formatTable(
          [
            {
              Active: activeEnv,
              TuturuuuWeb: payload.tuturuuu.web,
              UpskiiAdmin: payload.upskii.admin,
              UpskiiApp: payload.upskii.app,
            },
          ],
          { noColor }
        )
      );
      return;
    }

    if (action === 'list' || action === 'ls') {
      const rows = CLI_ENVS.map((name) => ({
        Active: name === activeEnv ? 'yes' : '',
        Env: name,
        Tuturuuu: resolveTuturuuuOrigins(name, deps.envVars).web,
        UpskiiApp: resolveUpskiiOrigins(name, deps.envVars).app,
      }));
      if (json) {
        write(
          `${JSON.stringify({ activeEnv, environments: rows }, null, 2)}\n`
        );
        return;
      }
      write(formatTable(rows, { noColor }));
      return;
    }

    if (action === 'use') {
      if (!target) {
        throw new CliError({
          code: 'MISSING_ENV',
          exitCode: CLI_EXIT.usage,
          hint: 'Use `ttr env use staging --yes` (or prod, sandbox, local).',
          message: 'Missing environment name.',
        });
      }
      const nextEnv = normalizeCliEnv(target);
      const gate = await requireMutationGate({
        flags,
        json,
        noColor,
        preview: {
          applyHint: `ttr env use ${nextEnv} --yes`,
          changes: [
            {
              after: nextEnv,
              before: config.defaultEnv ?? null,
              field: 'defaultEnv',
            },
          ],
          env: 'local',
          origin: 'local-config',
          target: 'cli-config:defaultEnv',
          tier: 1,
          title: `Set default CLI environment to ${nextEnv}`,
        },
        write,
      });
      if (!gate.applied) return;
      await writeCfg({ ...config, defaultEnv: nextEnv });
      if (json) {
        write(
          `${JSON.stringify({ defaultEnv: nextEnv, ok: true }, null, 2)}\n`
        );
        return;
      }
      write(`Default CLI environment set to ${nextEnv}.\n`);
      return;
    }

    throw new CliError({
      code: 'UNKNOWN_ENV_ACTION',
      exitCode: CLI_EXIT.usage,
      hint: 'Run `ttr env --help`.',
      message: `Unknown env action "${action}".`,
    });
  } catch (error) {
    process.exitCode = emitCliError(error, {
      json,
      noColor,
      writeErr: deps.writeErr,
    });
  }
}
