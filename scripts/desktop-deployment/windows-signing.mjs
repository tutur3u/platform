/* biome-ignore-all lint/suspicious/noUndeclaredEnvVars: CI signing-presence flags contain no credential values */
import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function windowsSigningMode({
  source = '',
  certificate,
  password,
  vault,
}) {
  if (source === 'vault') {
    if (!vault) throw new Error('Windows vault signing requires its own token');
    return 'vault';
  }
  if (source && source !== 'environment')
    throw new Error('Unknown desktop signing source');
  if (certificate !== password)
    throw new Error('Configure both Windows signing certificate and password');
  return certificate ? 'direct' : 'unsigned';
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const mode = windowsSigningMode({
    source: process.env.DESKTOP_SIGNING_SOURCE,
    certificate: process.env.WINDOWS_PFX_PRESENT === 'true',
    password: process.env.WINDOWS_PASSWORD_PRESENT === 'true',
    vault: process.env.WINDOWS_VAULT_PRESENT === 'true',
  });
  await appendFile(process.env.GITHUB_OUTPUT, `mode=${mode}\n`);
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    mode === 'unsigned'
      ? 'Windows installer is UNSIGNED. SmartScreen may warn; see release notes before installing.\n'
      : `Windows signing mode: ${mode}. Signing failures block this platform.\n`
  );
}
