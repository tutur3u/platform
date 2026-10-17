import { spawn } from 'node:child_process';
import { metadataDiagnostic } from './devbox-docker-metadata-diagnostic';

type SpawnFailure = 'not-found' | 'permission-denied' | 'other';
export interface DockerMetadata {
  code: number;
  output: string;
  timedOut: boolean;
  exitCode: number | null;
  signal: string | null;
  spawnFailure: SpawnFailure | null;
  timeoutMs: number;
}

function classifySpawn(error: unknown): SpawnFailure {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === 'ENOENT'
    ? 'not-found'
    : code === 'EACCES'
      ? 'permission-denied'
      : 'other';
}

// Return only fixed classifications/numeric process metadata, never command
// arguments, Docker hosts, stdout/stderr, or a provider's raw error message.
export function dockerMetadataFailure(result: DockerMetadata): string {
  if (result.timedOut) return `metadata timeout after ${result.timeoutMs}ms`;
  if (result.spawnFailure) return `metadata spawn ${result.spawnFailure}`;
  if (result.signal) {
    const signal = ['SIGKILL', 'SIGTERM', 'SIGINT', 'SIGABRT'].includes(
      result.signal
    )
      ? result.signal
      : 'other';
    return `metadata signal ${signal}`;
  }
  return result.exitCode === null
    ? 'metadata exit unavailable'
    : `metadata exit ${result.exitCode}`;
}

export async function dockerMetadata(
  args: string[],
  timeoutMs = 4000,
  dockerHost?: string
): Promise<DockerMetadata> {
  const result: DockerMetadata = {
    code: 1,
    output: '',
    timedOut: false,
    exitCode: null,
    signal: null,
    spawnFailure: null,
    timeoutMs,
  };
  const diagnostic = metadataDiagnostic();
  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(
      'docker',
      dockerHost ? ['--host', dockerHost, ...args] : args,
      {
        shell: false,
        stdio: ['ignore', 'pipe', 'ignore'],
      }
    );
  } catch (error) {
    result.spawnFailure = classifySpawn(error);
    diagnostic?.error(result.spawnFailure);
    diagnostic?.settle();
    return result;
  }
  const onSpawn = () => diagnostic?.spawn();
  const onClose = () => diagnostic?.close();
  if (diagnostic) {
    child.on('spawn', onSpawn);
    child.on('close', onClose);
  }
  child.stdout?.on('data', (chunk) => {
    diagnostic?.stdout(chunk);
    result.output = (result.output + String(chunk)).slice(0, 65_536);
  });
  diagnostic?.arm(timeoutMs);
  const timer = setTimeout(() => {
    result.timedOut = true;
    diagnostic?.deadline();
    const killed = child.kill('SIGKILL');
    diagnostic?.kill(killed);
  }, timeoutMs);
  try {
    await new Promise<void>((resolve) => {
      child.on('error', (error) => {
        result.spawnFailure = classifySpawn(error);
        diagnostic?.error(result.spawnFailure);
        resolve();
      });
      child.on('exit', (code, signal) => {
        diagnostic?.exit(code, signal);
        result.exitCode = code;
        result.signal = signal;
        result.code =
          !result.timedOut && !result.spawnFailure && !signal ? (code ?? 1) : 1;
        resolve();
      });
    });
    return result;
  } finally {
    clearTimeout(timer);
    child.removeListener('spawn', onSpawn);
    child.removeListener('close', onClose);
    diagnostic?.settle();
  }
}
