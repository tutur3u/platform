/**
 * Build-time constants. The deployed Worker is built with `false`, so the
 * bundler drops the unchecked transaction confirmation entirely; only the
 * workerd runtime test bundle sets it to `true`.
 */
export const PRODUCTION_DEFINES = Object.freeze({
  __SSO_SIGNER_UNCHECKED__: 'false',
});

export const RUNTIME_TEST_DEFINES = Object.freeze({
  __SSO_SIGNER_UNCHECKED__: 'true',
});
