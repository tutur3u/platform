/**
 * Shared helpers for the tuturuuu oxlint plugin.
 *
 * `context.filename` is an absolute path (both `/` and `\` separators can
 * appear on Windows), so every path regex below matches `[\\/]`.
 */

const TEST_FILE_RE = /\.(?:test|spec|node-test)\.[cm]?[jt]sx?$/;

/** True when the file is a test/spec file (e.g. `foo.test.ts`, `bar.spec.tsx`,
 *  `x.node-test.mjs`) or lives under a `__tests__` directory. */
export function isTestFile(filename) {
  return TEST_FILE_RE.test(filename) || /[\\/]__tests__[\\/]/.test(filename);
}

/** True when the file lives under `apps/<app>/src/`. */
export function isInAppSrc(filename) {
  return /(?:^|[\\/])apps[\\/][^\\/]+[\\/]src[\\/]/.test(filename);
}

const CONFIG_FILE_RE = /(?:^|[\\/])[^\\/]*\.config\.[cm]?[jt]sx?$/;

/** True when the file is a config file (e.g. `next.config.ts`, `vite.config.ts`). */
export function isConfigFile(filename) {
  return CONFIG_FILE_RE.test(filename);
}

/**
 * The origin patterns that block the Cloudflare cutover. A string literal is
 * flagged when it *contains* one of these origins (so `'https://tasks.tuturuuu.com/api'`
 * is also caught).
 */
export const BLOCKING_ORIGIN_RE =
  /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1?\]|(?:[a-z0-9-]+\.)*(?:tuturuuu|tutur3u)\.com|(?:[a-z0-9-]+\.)*vercel\.app)(?::\d+)?/i;
