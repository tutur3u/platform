/* biome-ignore-all lint/suspicious/noUndeclaredEnvVars: standalone CI-only scripts never run in Turbo or cache signing inputs */
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { lstat, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Commands handling private inputs never inherit stdout/stderr. The caller gets
// only a fixed error; the keychain, P12 and API key always leave with the runner.
export async function withMacosSigning(callback) {
  const names = [
    'MACOS_CERTIFICATE_P12_B64',
    'MACOS_CERTIFICATE_PASSWORD',
    'MACOS_SIGNING_IDENTITY',
    'APPLE_TEAM_ID',
    'APP_STORE_CONNECT_API_KEY_ID',
    'APP_STORE_CONNECT_ISSUER_ID',
    'APP_STORE_CONNECT_PRIVATE_KEY_P8_B64',
  ];
  if (
    names.some((name) => !process.env[name]) ||
    !process.env.MACOS_SIGNING_IDENTITY.startsWith('Developer ID Application:')
  ) {
    throw new Error(
      'macOS beta publication requires Developer ID signing and notarization credentials'
    );
  }
  const temp = process.env.RUNNER_TEMP;
  if (!temp) throw new Error('CI runner required');
  const keychain = join(temp, 'desktop-signing.keychain-db');
  const certificate = join(temp, 'desktop-signing.p12');
  const key = join(temp, 'desktop-notary.p8');
  const password = randomBytes(32).toString('hex');
  const identity = process.env.MACOS_SIGNING_IDENTITY;
  const exec = (command, args) =>
    execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  try {
    await writeFile(
      certificate,
      Buffer.from(process.env.MACOS_CERTIFICATE_P12_B64, 'base64'),
      { mode: 0o600 }
    );
    await writeFile(
      key,
      Buffer.from(process.env.APP_STORE_CONNECT_PRIVATE_KEY_P8_B64, 'base64'),
      { mode: 0o600 }
    );
    exec('security', ['create-keychain', '-p', password, keychain]);
    exec('security', ['set-keychain-settings', '-lut', '21600', keychain]);
    exec('security', ['unlock-keychain', '-p', password, keychain]);
    exec('security', [
      'import',
      certificate,
      '-k',
      keychain,
      '-P',
      process.env.MACOS_CERTIFICATE_PASSWORD,
      '-T',
      '/usr/bin/codesign',
    ]);
    exec('security', [
      'set-key-partition-list',
      '-S',
      'apple-tool:,apple:,codesign:',
      '-s',
      '-k',
      password,
      keychain,
    ]);
    const sign = (path, entitlements) =>
      exec('codesign', [
        '--force',
        '--options',
        'runtime',
        '--timestamp',
        '--sign',
        identity,
        '--keychain',
        keychain,
        ...(entitlements ? ['--entitlements', entitlements] : []),
        path,
      ]);
    await callback({
      async signApp(app) {
        // Sign real Mach-O files first, then nested bundles from the inside out.
        async function visit(path) {
          const stat = await lstat(path);
          if (stat.isSymbolicLink()) return;
          if (stat.isDirectory()) {
            for (const name of await readdir(path))
              await visit(join(path, name));
            if (/\.(?:framework|app|xpc)$/.test(path) && path !== app)
              sign(path);
          } else if (stat.isFile()) {
            const bytes = await readFile(path);
            if (
              bytes.length >= 4 &&
              [
                0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe,
                0xbebafeca,
              ].includes(bytes.readUInt32BE(0))
            )
              sign(path);
          }
        }
        await visit(app);
        sign(app, 'apps/mobile/macos/Runner/Release.entitlements');
        exec('codesign', ['--verify', '--deep', '--strict', app]);
        const details = spawnSync('codesign', ['-d', '--verbose=4', app], {
          encoding: 'utf8',
        });
        if (
          details.status !== 0 ||
          !details.stderr
            .split('\n')
            .includes(`TeamIdentifier=${process.env.APPLE_TEAM_ID}`)
        )
          throw new Error('Unexpected signing team');
      },
      async notarize(dmg) {
        sign(dmg);
        const result = JSON.parse(
          exec('xcrun', [
            'notarytool',
            'submit',
            dmg,
            '--key',
            key,
            '--key-id',
            process.env.APP_STORE_CONNECT_API_KEY_ID,
            '--issuer',
            process.env.APP_STORE_CONNECT_ISSUER_ID,
            '--wait',
            '--timeout',
            '20m',
            '--output-format',
            'json',
          ])
        );
        if (result.status !== 'Accepted')
          throw new Error('Notarization not accepted');
        exec('xcrun', ['stapler', 'staple', dmg]);
        exec('xcrun', ['stapler', 'validate', dmg]);
        exec('spctl', [
          '--assess',
          '--type',
          'open',
          '--context',
          'context:primary-signature',
          dmg,
        ]);
      },
    });
  } catch {
    throw new Error(
      'macOS signing or notarization failed; no public release was created'
    );
  } finally {
    try {
      exec('security', ['delete-keychain', keychain]);
    } catch {
      /* Keychain may not have been created. */
    }
    await Promise.all(
      [certificate, key].map((path) => rm(path, { force: true }))
    );
  }
}
