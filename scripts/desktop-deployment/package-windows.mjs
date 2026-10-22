import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { windowsSigningMode } from './windows-signing.mjs';

export function packageWindows({
  bundle,
  output,
  version,
  env,
  execute = execFileSync,
}) {
  const mode = windowsSigningMode({
    certificate: Boolean(env.WINDOWS_SIGNING_CERTIFICATE_PFX_B64),
    password: Boolean(env.WINDOWS_SIGNING_CERTIFICATE_PASSWORD),
  });
  const sign = (path) =>
    execute(
      'pwsh',
      [
        '-NoProfile',
        '-File',
        'scripts/desktop-deployment/sign-windows.ps1',
        '-Path',
        path,
      ],
      { stdio: 'inherit' }
    );
  if (mode === 'direct') sign(bundle);
  const compiler = join(
    env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
    'Inno Setup 6/ISCC.exe'
  );
  execute(
    compiler,
    [
      `/DAppVersion=${version}`,
      `/DBuildRoot=${bundle}`,
      `/DOutputRoot=${output}`,
      'scripts/desktop-deployment/windows-installer.iss',
    ],
    { stdio: 'inherit' }
  );
  if (mode === 'direct') sign(join(output, 'Tuturuuu-windows-x64-setup.exe'));
  return mode === 'direct' ? 'authenticode-timestamped' : 'unsigned-windows';
}
