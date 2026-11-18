import assert from 'node:assert/strict';

const MISSING_SECRET = /^missing declared secret /;

/** Waits between attempts, about one minute in total. */
export const SECRET_LIST_RETRY_DELAYS_MS = [
  2_000, 4_000, 8_000, 16_000, 30_000,
];

/**
 * Cloudflare's script secrets list can trail a fresh publication by a few
 * seconds, so a declared secret may be missing from the first read even though
 * the published version binds it. Only that assertion is retried, a bounded
 * number of times; every other failure, and a secret that stays missing,
 * fails immediately as before.
 */
export async function retryMissingSecret(
  capture,
  {
    delays = SECRET_LIST_RETRY_DELAYS_MS,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log = (message) => console.warn(message),
  } = {}
) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await capture();
    } catch (error) {
      const lagging =
        error instanceof assert.AssertionError &&
        MISSING_SECRET.test(error.message);
      if (!lagging || attempt >= delays.length) throw error;
      log(
        `Worker settings: ${error.message}; secrets list re-read ${attempt + 1}/${delays.length} in ${delays[attempt] / 1000} s`
      );
      await sleep(delays[attempt]);
    }
  }
}
