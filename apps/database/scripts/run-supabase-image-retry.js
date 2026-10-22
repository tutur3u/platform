import { setTimeout as sleep } from 'node:timers/promises';

// Seven attempts: six bounded waits of 10/20/40/80/120/120 seconds plus up to
// 25% jitter, about eight minutes in the worst case.
const MAX_ATTEMPTS = 7;
const BASE_DELAY_MS = 10_000;
const MAX_DELAY_MS = 120_000;
const JITTER_RATIO = 0.25;

// Match the CLI's terminal registry diagnostics, not generic command failures.
export function isTransientImagePullFailure(stderr) {
  const text = String(stderr);
  if (
    /SQLSTATE|failed to apply migration|unauthorized|authentication required|denied|manifest unknown|not found|no matching manifest/i.test(
      text
    )
  ) {
    return false;
  }
  return (
    /toomanyrequests|too many requests/i.test(text) ||
    (/failed to pull (?:docker )?image|error pulling image/i.test(text) &&
      /timeout|timed out|connection reset|unexpected EOF|TLS handshake|\b50[234]\b|temporarily unavailable/i.test(
        text
      ))
  );
}

export function isImagePullCommand(args) {
  // Never replay migrations, SQL tests, pushes or resets.
  const command = args[0] === '--workdir' ? args.slice(2) : args;
  return (
    command[0] === 'start' || (command[0] === 'gen' && command[1] === 'types')
  );
}

export async function retryImagePull(
  invoke,
  {
    enabled = true,
    sleepMs = sleep,
    random = Math.random,
    stderr = process.stderr,
  } = {}
) {
  for (let attempt = 1; ; attempt += 1) {
    const result = await invoke();
    if (
      !enabled ||
      result.code === 0 ||
      result.signal ||
      attempt === MAX_ATTEMPTS ||
      !isTransientImagePullFailure(result.stderr ?? '')
    )
      return result;
    const delay = Math.round(
      Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (attempt - 1)) *
        (1 + random() * JITTER_RATIO)
    );
    stderr.write(
      `Supabase image pull failed; retry ${attempt + 1}/${MAX_ATTEMPTS} in ${delay}ms.\n`
    );
    await sleepMs(delay);
  }
}

export function appendDiagnostic(tail, chunk) {
  // Retain only a bounded diagnostic tail; never mix diagnostics into types.
  return (tail + chunk.toString()).slice(-64 * 1024);
}
