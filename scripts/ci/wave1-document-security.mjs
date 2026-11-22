import assert from 'node:assert/strict';

// Header shapes come from packages/start-bridge/src/core/{csp,document-security}.ts.
const NONCE_SCRIPT_POLICY =
  /(?:^|;\s*)script-src [^;]*'nonce-[A-Za-z0-9+/=]+'[^;]*'strict-dynamic'/u;
const TRUSTED_TYPES_DIRECTIVE = /require-trusted-types-for 'script'/u;

/**
 * Asserts an owned HTML response carries an enforcing nonce script policy and
 * that Trusted Types is delivered only through the report-only header while
 * the app's `TTR_TRUSTED_TYPES_<APP>` mode is `report`.
 *
 * @param {(name: string) => string | null | undefined} header
 * @param {{ where: string, basePath?: string }} options
 */
export function assertReportOnlyTrustedTypes(header, { where, basePath = '' }) {
  const enforcing = header('content-security-policy') ?? '';
  const reportOnly = header('content-security-policy-report-only') ?? '';
  assert.match(
    enforcing,
    NONCE_SCRIPT_POLICY,
    `${where}: enforcing nonce and strict-dynamic script policy`
  );
  assert.doesNotMatch(
    enforcing,
    TRUSTED_TYPES_DIRECTIVE,
    `${where}: Trusted Types must not be enforced`
  );
  assert.match(
    reportOnly,
    TRUSTED_TYPES_DIRECTIVE,
    `${where}: Trusted Types reported through the report-only policy`
  );
  assert.ok(
    reportOnly.includes(`report-uri ${basePath}/api/csp-report`),
    `${where}: Trusted Types violations report to the app's own endpoint`
  );
}
