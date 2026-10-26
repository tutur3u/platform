/**
 * Static auth-surface guards. `bun check` always runs them; `check:changed`
 * runs them when app or package source changes.
 */
const AUTH_GUARDS = [
  {
    name: 'server-console',
    script: 'scripts/check-server-console.js',
    summary: 'Server logs use native console methods',
  },
  {
    name: 'internal-app-auth',
    script: 'scripts/check-internal-app-auth.js',
    summary: 'Registered app auth surfaces use app sessions',
  },
  {
    name: 'satellite-cookie-auth',
    script: 'scripts/check-satellite-cookie-auth.js',
    summary: 'Satellites authorize with app-session-aware clients',
  },
  {
    name: 'browser-session-surface',
    script: 'scripts/check-browser-session-surface.js',
    summary: 'Browser session surfaces stay within the allowlist',
  },
];

const authGuardChecks = AUTH_GUARDS.map(({ name, script, summary }) => ({
  name,
  command: 'node',
  args: [script],
  parseOutput: () => summary,
}));

module.exports = { AUTH_GUARDS, authGuardChecks };
