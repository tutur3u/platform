#!/usr/bin/env node
// Signs a built Tuturuuu.app for the Mac App Store and wraps it in a signed
// installer package. Inputs come from the hydrated mobile deployment bundle:
//   APPLE_TEAM_ID, APPLE_DISTRIBUTION_CERTIFICATE_P12_PATH/_PASSWORD,
//   APPLE_MAC_INSTALLER_CERTIFICATE_P12_PATH/_PASSWORD,
//   APPLE_MAC_APPSTORE_PROVISIONING_PROFILE_PATH.
// Usage: package-mac-app-store.mjs <Tuturuuu.app> <output.pkg>
// Command output that may describe private keys never reaches the log.

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import {
  INHERITED_SANDBOX,
  MAC_APP_STORE_BUNDLE_ID,
  machOKind,
  renderEntitlements,
  verifyProfile,
} from './mac-app-store-entitlements.mjs';
import { stageLocalInferenceMacos } from './stage-local-inference-macos.mjs';

const [appArgument, pkgArgument] = process.argv.slice(2);
const required = [
  'RUNNER_TEMP',
  'APPLE_TEAM_ID',
  'APPLE_DISTRIBUTION_CERTIFICATE_P12_PATH',
  'APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD',
  'APPLE_MAC_INSTALLER_CERTIFICATE_P12_PATH',
  'APPLE_MAC_INSTALLER_CERTIFICATE_PASSWORD',
  'APPLE_MAC_APPSTORE_PROVISIONING_PROFILE_PATH',
];
if (!appArgument || !pkgArgument || required.some((name) => !process.env[name]))
  throw new Error('Mac App Store packaging inputs are incomplete');

const app = resolve(appArgument);
const pkg = resolve(pkgArgument);
const teamId = process.env.APPLE_TEAM_ID;
const work = join(process.env.RUNNER_TEMP, 'mac-app-store-signing');
const keychain = join(work, 'mac-app-store.keychain-db');
const keychainPassword = randomBytes(32).toString('hex');

const quiet = (command, args) =>
  execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
const plistJson = (path) =>
  JSON.parse(quiet('plutil', ['-convert', 'json', '-o', '-', path]));

async function writePlist(path, value) {
  const json = `${path}.json`;
  await writeFile(json, JSON.stringify(value), { mode: 0o600 });
  quiet('plutil', ['-convert', 'xml1', '-o', path, json]);
  await rm(json, { force: true });
}

function identity(policy, pattern) {
  const matches = new Set();
  for (const line of quiet('security', [
    'find-identity',
    '-v',
    '-p',
    policy,
    keychain,
  ]).split('\n')) {
    const row = line.match(/^\s*\d+\) ([A-F0-9]{40}) "([^"]+)"\s*$/u);
    if (row && pattern.test(row[2]) && row[2].endsWith(` (${teamId})`))
      matches.add(row[1]);
  }
  if (matches.size !== 1) throw new Error(`Unique ${policy} identity required`);
  return [...matches][0];
}

async function signBundle(signer, inheritedPath) {
  const sign = (path, entitlements) =>
    quiet('codesign', [
      '--force',
      '--timestamp',
      '--sign',
      signer,
      '--keychain',
      keychain,
      ...(entitlements ? ['--entitlements', entitlements] : []),
      path,
    ]);
  const main = join(app, 'Contents/MacOS', basename(app, '.app'));
  // Inside-out: Mach-O files, then nested bundles, then the app itself.
  async function visit(path) {
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      for (const name of await readdir(path)) await visit(join(path, name));
      if (path === app) return;
      if (/\.(?:app|xpc)$/u.test(path)) sign(path, inheritedPath);
      else if (/\.framework$/u.test(path)) sign(path);
      return;
    }
    if (!stat.isFile() || path === main) return;
    const kind = machOKind(await readFile(path));
    // Helper executables must inherit the parent sandbox to be accepted.
    if (kind === 'executable') sign(path, inheritedPath);
    else if (kind === 'library') sign(path);
  }
  await visit(app);
}

let originalSearchList;
try {
  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true, mode: 0o700 });

  const profilePlist = join(work, 'profile.plist');
  await writeFile(
    profilePlist,
    quiet('security', [
      'cms',
      '-D',
      '-i',
      process.env.APPLE_MAC_APPSTORE_PROVISIONING_PROFILE_PATH,
    ]),
    { mode: 0o600 }
  );
  const entitlements = renderEntitlements(
    plistJson('apps/mobile/macos/Runner/AppStore.entitlements'),
    { teamId }
  );
  verifyProfile(plistJson(profilePlist), entitlements, { teamId });
  const appEntitlements = join(work, 'app.entitlements');
  const inheritedEntitlements = join(work, 'inherited.entitlements');
  await writePlist(appEntitlements, entitlements);
  await writePlist(inheritedEntitlements, INHERITED_SANDBOX);

  const info = plistJson(join(app, 'Contents/Info.plist'));
  if (info.CFBundleIdentifier !== MAC_APP_STORE_BUNDLE_ID)
    throw new Error('Unexpected bundle identifier');
  if (info.ITSAppUsesNonExemptEncryption !== false)
    throw new Error('Export compliance key missing');
  if (!info.LSApplicationCategoryType) throw new Error('Category missing');
  for (const name of ['PrivacyInfo.xcprivacy'])
    await lstat(join(app, 'Contents/Resources', name));

  await stageLocalInferenceMacos(app);
  for (const locale of ['en', 'vi']) {
    const destination = join(app, 'Contents/Resources', `${locale}.lproj`);
    await mkdir(destination, { recursive: true });
    await copyFile(
      `scripts/desktop-deployment/macos-localizations/${locale}.strings`,
      join(destination, 'InfoPlist.strings')
    );
  }
  await copyFile(
    process.env.APPLE_MAC_APPSTORE_PROVISIONING_PROFILE_PATH,
    join(app, 'Contents/embedded.provisionprofile')
  );

  originalSearchList = quiet('security', ['list-keychains', '-d', 'user'])
    .split('\n')
    .map((line) => line.trim().replace(/^"|"$/gu, ''))
    .filter(Boolean);
  quiet('security', ['create-keychain', '-p', keychainPassword, keychain]);
  quiet('security', ['set-keychain-settings', '-lut', '21600', keychain]);
  quiet('security', ['unlock-keychain', '-p', keychainPassword, keychain]);
  quiet('security', [
    'list-keychains',
    '-d',
    'user',
    '-s',
    ...originalSearchList,
    keychain,
  ]);
  for (const [path, password] of [
    [
      process.env.APPLE_DISTRIBUTION_CERTIFICATE_P12_PATH,
      process.env.APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD,
    ],
    [
      process.env.APPLE_MAC_INSTALLER_CERTIFICATE_P12_PATH,
      process.env.APPLE_MAC_INSTALLER_CERTIFICATE_PASSWORD,
    ],
  ])
    quiet('security', [
      'import',
      path,
      '-k',
      keychain,
      '-P',
      password,
      '-f',
      'pkcs12',
      '-T',
      '/usr/bin/codesign',
      '-T',
      '/usr/bin/productbuild',
    ]);
  quiet('security', [
    'set-key-partition-list',
    '-S',
    'apple-tool:,apple:,codesign:',
    '-s',
    '-k',
    keychainPassword,
    keychain,
  ]);

  const appSigner = identity('codesigning', /^Apple Distribution: /u);
  const installerSigner = identity(
    'basic',
    /^(?:3rd Party Mac Developer Installer|Mac Installer Distribution): /u
  );

  await signBundle(appSigner, inheritedEntitlements);
  quiet('codesign', [
    '--force',
    '--timestamp',
    '--sign',
    appSigner,
    '--keychain',
    keychain,
    '--entitlements',
    appEntitlements,
    app,
  ]);
  quiet('codesign', ['--verify', '--deep', '--strict', app]);
  const signedPath = join(work, 'signed.entitlements');
  await writeFile(
    signedPath,
    quiet('codesign', ['-d', '--entitlements', ':-', app])
  );
  const signed = plistJson(signedPath);
  if (
    signed['com.apple.security.app-sandbox'] !== true ||
    signed['com.apple.application-identifier'] !==
      `${teamId}.${MAC_APP_STORE_BUNDLE_ID}` ||
    signed['get-task-allow'] === true
  )
    throw new Error('Signed entitlements are not Mac App Store ready');

  await mkdir(resolve(pkg, '..'), { recursive: true });
  quiet('productbuild', [
    '--component',
    app,
    '/Applications',
    '--sign',
    installerSigner,
    '--keychain',
    keychain,
    pkg,
  ]);
  quiet('pkgutil', ['--check-signature', pkg]);
  process.stdout.write(`Mac App Store package ready: ${basename(pkg)}\n`);
} finally {
  if (originalSearchList)
    try {
      quiet('security', [
        'list-keychains',
        '-d',
        'user',
        '-s',
        ...originalSearchList,
      ]);
    } catch {
      process.exitCode = 1;
    }
  try {
    quiet('security', ['delete-keychain', keychain]);
  } catch {}
  await rm(work, { recursive: true, force: true });
}
