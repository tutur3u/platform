const path = require('node:path');

const { getPositiveIntegerEnv, runChecked, sleep } = require('./compose.js');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DEFAULT_SUPABASE_RESET_RETRY_MAX_ATTEMPTS = 4;
const DEFAULT_SUPABASE_RESET_RETRY_INITIAL_DELAY_MS = 5_000;
const DEFAULT_SUPABASE_RESET_RETRY_MAX_DELAY_MS = 60_000;

function getErrorText(error) {
  if (!error || typeof error !== 'object') {
    return String(error);
  }

  return [
    error instanceof Error ? error.message : String(error),
    typeof error.stderr === 'string' ? error.stderr : '',
    typeof error.stdout === 'string' ? error.stdout : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function isTransientSupabaseResetError(error) {
  const message = getErrorText(error);

  return /(?:Error status\s+(?:429|5\d\d)\b|(?:\b(?:429|5\d\d)\b.*(?:upstream|server|gateway|unavailable|too many requests))|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|fetch failed|temporary failure|TLS handshake timeout|i\/o timeout|connection reset by peer|context deadline exceeded|Client\.Timeout exceeded|request canceled|unexpected EOF|network is unreachable)/iu.test(
    message
  );
}

async function stopSupabaseBestEffort({ env, fsImpl, runCommand: run }) {
  try {
    await runChecked('bun', ['sb:stop'], {
      cwd: ROOT_DIR,
      env,
      fsImpl,
      runCommand: run,
      stdio: 'pipe',
      teeOutput: true,
    });
  } catch (error) {
    process.stderr.write(
      `Supabase reset retry cleanup failed; continuing: ${getErrorText(
        error
      )}\n`
    );
  }
}

async function runSupabaseResetWithRetry({
  env,
  fsImpl,
  runCommand: run,
  sleep: sleepImpl = sleep,
}) {
  const maxAttempts = getPositiveIntegerEnv(
    env,
    'DOCKER_WEB_SUPABASE_RESET_RETRY_MAX_ATTEMPTS',
    DEFAULT_SUPABASE_RESET_RETRY_MAX_ATTEMPTS
  );
  const maxDelayMs = getPositiveIntegerEnv(
    env,
    'DOCKER_WEB_SUPABASE_RESET_RETRY_MAX_DELAY_MS',
    DEFAULT_SUPABASE_RESET_RETRY_MAX_DELAY_MS
  );
  let delayMs = getPositiveIntegerEnv(
    env,
    'DOCKER_WEB_SUPABASE_RESET_RETRY_INITIAL_DELAY_MS',
    DEFAULT_SUPABASE_RESET_RETRY_INITIAL_DELAY_MS
  );

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await runChecked('bun', ['sb:reset'], {
        cwd: ROOT_DIR,
        env,
        fsImpl,
        runCommand: run,
        stdio: 'pipe',
        teeOutput: true,
      });
    } catch (error) {
      if (attempt >= maxAttempts || !isTransientSupabaseResetError(error)) {
        throw error;
      }

      process.stderr.write(
        `Supabase reset hit a transient error; stopping local Supabase and retrying in ${delayMs}ms (attempt ${
          attempt + 1
        }/${maxAttempts}).\n`
      );
      await stopSupabaseBestEffort({ env, fsImpl, runCommand: run });
      await sleepImpl(delayMs);
      delayMs = Math.min(delayMs * 2, maxDelayMs);
    }
  }
}

module.exports = {
  DEFAULT_SUPABASE_RESET_RETRY_INITIAL_DELAY_MS,
  DEFAULT_SUPABASE_RESET_RETRY_MAX_ATTEMPTS,
  DEFAULT_SUPABASE_RESET_RETRY_MAX_DELAY_MS,
  getErrorText,
  getPositiveIntegerEnv,
  isTransientSupabaseResetError,
  runSupabaseResetWithRetry,
  sleep,
  stopSupabaseBestEffort,
};
