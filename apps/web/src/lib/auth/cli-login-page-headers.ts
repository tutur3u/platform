export const CLI_LOGIN_START_PATH = '/api/cli/auth/start';

// The CLI copy page renders in an opaque origin with no script, so a
// same-origin opener (window.open from injected script) cannot read the
// token, and COOP severs the opener handle. next.config.ts applies these to
// the whole path after the platform anti-framing rule (config headers win
// over handler headers in Next, and the last matching rule wins per key);
// the route sets them too for runtimes without config headers.
export const CLI_LOGIN_PAGE_SECURITY_HEADERS = [
  {
    key: 'Content-Security-Policy',
    value:
      "sandbox; default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
];
