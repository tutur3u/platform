/* biome-ignore-all lint/suspicious/noUndeclaredEnvVars: standalone CI-only scripts never run in Turbo or cache signing inputs */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFile,
  mkdir,
  readFile,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { auditBundle } from './audit-bundle.mjs';
import { withMacosSigning } from './sign-macos.mjs';

const platform = process.env.DESKTOP_PLATFORM;
const runnerTemp = process.env.RUNNER_TEMP;
const run = process.env.GITHUB_RUN_ID;
if (!runnerTemp || !/^\d+$/.test(run ?? ''))
  throw new Error('CI runner required');
const version = (await readFile('apps/mobile/pubspec.yaml', 'utf8')).match(
  /^version: (\d+\.\d+\.\d+)\+/m
)?.[1];
if (!version) throw new Error('Invalid app version');
const output = join(runnerTemp, 'desktop-artifacts');
await mkdir(output, { recursive: true });
async function receipt(name, verification) {
  const bytes = await readFile(join(output, name));
  await writeFile(
    join(output, `verified-${platform}.json`),
    JSON.stringify({
      name,
      platform,
      verification,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      source: process.env.GITHUB_SHA,
      run,
    })
  );
}
if (platform === 'linux') {
  const bundle = resolve('apps/mobile/build/linux/x64/release/bundle');
  await auditBundle(bundle);
  execFileSync(
    process.execPath,
    [
      'scripts/desktop-deployment/package-linux.mjs',
      bundle,
      output,
      `${version}-${run}`,
    ],
    { stdio: 'inherit' }
  );
  execFileSync('dpkg-deb', ['--info', join(output, 'Tuturuuu-linux-x64.deb')], {
    stdio: 'ignore',
  });
  await receipt('Tuturuuu-linux-x64.deb', 'deb-package-verified');
} else if (platform === 'windows') {
  const bundle = resolve('apps/mobile/build/windows/x64/runner/Release');
  await auditBundle(bundle);
  const sign = (path) =>
    execFileSync(
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
  sign(bundle);
  const compiler = join(
    process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
    'Inno Setup 6/ISCC.exe'
  );
  execFileSync(
    compiler,
    [
      `/DAppVersion=${version}`,
      `/DBuildRoot=${bundle}`,
      `/DOutputRoot=${output}`,
      'scripts/desktop-deployment/windows-installer.iss',
    ],
    { stdio: 'inherit' }
  );
  sign(join(output, 'Tuturuuu-windows-x64-setup.exe'));
  await receipt('Tuturuuu-windows-x64-setup.exe', 'authenticode-timestamped');
} else if (platform === 'macos') {
  const bundle = resolve(
    'apps/mobile/build/macos/Build/Products/Release-production/Tuturuuu.app'
  );
  for (const locale of ['en', 'vi']) {
    const destination = join(bundle, 'Contents/Resources', `${locale}.lproj`);
    await mkdir(destination, { recursive: true });
    await copyFile(
      `scripts/desktop-deployment/macos-localizations/${locale}.strings`,
      join(destination, 'InfoPlist.strings')
    );
  }
  await auditBundle(bundle);
  // Both architectures must actually exist before advertising a universal app.
  const architectures = execFileSync(
    'lipo',
    ['-archs', join(bundle, 'Contents/MacOS/Tuturuuu')],
    { encoding: 'utf8' }
  );
  if (!architectures.includes('arm64') || !architectures.includes('x86_64'))
    throw new Error('macOS beta must be universal');
  await withMacosSigning(async ({ signApp, notarize }) => {
    await signApp(bundle);
    const stage = join(runnerTemp, 'desktop-dmg');
    await mkdir(stage, { recursive: true });
    execFileSync('ditto', [bundle, join(stage, 'Tuturuuu.app')]);
    await symlink('/Applications', join(stage, 'Applications'));
    const dmg = join(output, 'Tuturuuu-macos-universal.dmg');
    execFileSync(
      'hdiutil',
      [
        'create',
        '-volname',
        'Tuturuuu Beta',
        '-srcfolder',
        stage,
        '-ov',
        '-format',
        'UDZO',
        dmg,
      ],
      { stdio: 'inherit' }
    );
    await notarize(dmg);
    await receipt(
      'Tuturuuu-macos-universal.dmg',
      'developer-id-notarized-stapled'
    );
  });
} else {
  throw new Error('Unsupported desktop platform');
}
