import { type FlagValue, getFlag } from './args';

const DEFAULT_WEB_CWD = 'apps/web';
const DEFAULT_WEB_PORT = 7803;
const DEFAULT_CLOUDFLARED_IMAGE = 'cloudflare/cloudflared:latest';

function shellQuote(value: string) {
  return `'${value.replace(/'/gu, "'\\''")}'`;
}

function parsePositiveIntegerFlag({
  defaultValue,
  flagName,
  value,
}: {
  defaultValue: number;
  flagName: string;
  value: string | undefined;
}) {
  if (!value) return defaultValue;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid --${flagName} value: ${value}`);
  }

  return parsed;
}

export function createBuildCommand(flags: Record<string, FlagValue>) {
  const cwd = getFlag(flags, 'cwd');
  const buildCommand = getFlag(flags, 'build-command');

  if (buildCommand) return ['bash', '-c', buildCommand];
  if (cwd) return ['bun', 'run', '--cwd', cwd, 'build'];
  return ['bun', 'run', 'build'];
}

export function createCloudflaredDockerCommand(
  flags: Record<string, FlagValue>
) {
  const image =
    getFlag(flags, 'cloudflared-image') ?? DEFAULT_CLOUDFLARED_IMAGE;
  return `docker run --rm --network host ${shellQuote(
    image
  )} tunnel run --token "$CLOUDFLARED_TOKEN"`;
}

export function createServeScript(flags: Record<string, FlagValue>) {
  const cwd = getFlag(flags, 'cwd') ?? DEFAULT_WEB_CWD;
  const port = parsePositiveIntegerFlag({
    defaultValue: DEFAULT_WEB_PORT,
    flagName: 'port',
    value: getFlag(flags, 'port'),
  });
  const buildCommand =
    flags['no-build'] === true
      ? undefined
      : (getFlag(flags, 'build-command') ??
        `bun run --cwd ${shellQuote(cwd)} build`);
  const serveCommand =
    getFlag(flags, 'serve-command') ??
    `PORT=${port} bun run --cwd ${shellQuote(cwd)} start:app`;
  const cloudflaredCommand =
    flags.cloudflared === true ||
    getFlag(flags, 'cloudflared-token-env') ||
    getFlag(flags, 'token-env')
      ? createCloudflaredDockerCommand(flags)
      : undefined;
  const lines = [
    'set -euo pipefail',
    buildCommand,
    `${serveCommand} &`,
    'APP_PID=$!',
    'cleanup() {',
    `  kill "$APP_PID" "\${TUNNEL_PID:-}" 2>/dev/null || true`,
    '}',
    'trap cleanup INT TERM EXIT',
    cloudflaredCommand ? `${cloudflaredCommand} &` : undefined,
    cloudflaredCommand ? 'TUNNEL_PID=$!' : undefined,
    cloudflaredCommand ? 'wait -n "$APP_PID" "$TUNNEL_PID"' : 'wait "$APP_PID"',
  ].filter(Boolean);

  return {
    command: ['bash', '-c', lines.join('\n')],
    port,
    usesCloudflared: Boolean(cloudflaredCommand),
  };
}
