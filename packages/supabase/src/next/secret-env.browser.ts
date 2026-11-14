/**
 * Browser resolution target for `#secret-env` and `./next/secret-env`.
 *
 * Client bundles receive this stub instead of the server reader, so they can
 * never contain the secret reader. It must not read any environment variable.
 */
export function checkSecretEnvVariables(): never {
  throw new Error('server-only API');
}
