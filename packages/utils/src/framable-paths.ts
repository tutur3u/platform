/**
 * Paths every app leaves framable, deliberately designed to be embedded in a
 * third-party page. The upstream response owns their framing and sandbox
 * policy: Web serves uploaded WebGL builds with
 * `Content-Security-Policy: sandbox allow-scripts ...`, which must reach the
 * browser untouched or the uploaded scripts run unsandboxed on the app origin.
 *
 * Next `source` syntax without the leading slash (see next-config), shared
 * with the start-bridge Worker. No imports: Workers and Node type stripping
 * load this module directly.
 */
export const TUTURUUU_DEFAULT_FRAMABLE_PATTERNS = [
  'api/v1/workspaces/[^/]+/external-projects/assets/[^/]+/webgl',
] as const;

/**
 * The patterns as anchored regexes over an app-relative pathname. Unlike
 * Next's case-insensitive header `source` matching these are case-sensitive,
 * which is harmless: central's routes are case-sensitive too, so an
 * upper-case variant never serves the sandboxed build.
 */
export function framablePathRegexes(
  patterns: readonly string[] = TUTURUUU_DEFAULT_FRAMABLE_PATTERNS
): RegExp[] {
  return patterns.map((pattern) => new RegExp(`^/${pattern}(?:/|$)`, 'u'));
}
