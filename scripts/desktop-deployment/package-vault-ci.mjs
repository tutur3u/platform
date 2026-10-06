/* biome-ignore-all lint/suspicious/noUndeclaredEnvVars: protected CI-only signing inputs */
import { fetchSigningBundle } from './vault-fetch.mjs';
import { signVaultBundle } from './vault-signing.mjs';

try {
  const bundle = await fetchSigningBundle(process.env);
  await signVaultBundle(process.env, bundle);
} catch {
  // Never print HTTP bodies, spawn errors, certificate values, or token material.
  process.stderr.write(
    'Desktop vault signing failed; public beta publication is blocked.\n'
  );
  process.exitCode = 1;
}
