/* biome-ignore-all lint/suspicious/noUndeclaredEnvVars: standalone CI-only scripts never run in Turbo or cache signing inputs */
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { lstat, open, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { readRegularFile } from '../safe-fs.js';
import { codesignDiagnostic } from './codesign-diagnostic.mjs';

const identityOutputLimit = 65536;
function hasAsciiControl(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function keychainSearchList(output) {
  if (
    typeof output !== 'string' ||
    Buffer.byteLength(output, 'utf8') > identityOutputLimit
  )
    throw new Error('Invalid keychain search list');
  const entries = output
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const entry = JSON.parse(line.trim());
      if (
        typeof entry !== 'string' ||
        !entry.startsWith('/') ||
        entry.length > 4096 ||
        hasAsciiControl(entry)
      )
        throw new Error('Invalid keychain search list');
      return entry;
    });
  if (entries.length > 128) throw new Error('Invalid keychain search list');
  return entries;
}

function importedIdentity(output, requested) {
  if (
    typeof output !== 'string' ||
    Buffer.byteLength(output, 'utf8') > identityOutputLimit
  )
    throw new Error('Invalid signing identity listing');
  const fingerprints = new Set();
  let rows = 0;
  let total;
  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    const summary = line.match(/^\s*(\d+) valid identities found\s*$/u);
    if (summary) {
      if (total !== undefined)
        throw new Error('Invalid signing identity listing');
      total = Number(summary[1]);
      continue;
    }
    const row = line.match(/^\s*\d+\) ([A-Fa-f0-9]{40}) "([^"]+)"\s*$/u);
    if (!row || hasAsciiControl(row[2]) || total !== undefined)
      throw new Error('Invalid signing identity listing');
    rows += 1;
    if (row[2] === requested) fingerprints.add(row[1].toUpperCase());
  }
  if (total !== rows || fingerprints.size !== 1)
    throw new Error('Unique valid signing identity required');
  return [...fingerprints][0];
}

// Commands handling private inputs never inherit stdout/stderr. The caller gets
// only fixed stage/classification errors; the keychain, P12 and API key always leave with the runner.
export async function withMacosSigning(
  callback,
  { execute = execFileSync, inspect = spawnSync } = {}
) {
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
    !/^[A-Z0-9]{10}$/u.test(process.env.APPLE_TEAM_ID) ||
    !/^Developer ID Application: [^"]+$/u.test(
      process.env.MACOS_SIGNING_IDENTITY
    ) ||
    process.env.MACOS_SIGNING_IDENTITY.length > 1024 ||
    hasAsciiControl(process.env.MACOS_SIGNING_IDENTITY) ||
    !process.env.MACOS_SIGNING_IDENTITY.endsWith(
      ` (${process.env.APPLE_TEAM_ID})`
    )
  ) {
    throw new Error(
      'macOS beta publication requires Developer ID signing and notarization credentials'
    );
  }
  const temp = process.env.DESKTOP_SIGNING_TEMP ?? process.env.RUNNER_TEMP;
  if (!temp) throw new Error('CI runner required');
  const keychain = join(temp, 'desktop-signing.keychain-db');
  const certificate = join(temp, 'desktop-signing.p12');
  const key = join(temp, 'desktop-notary.p8');
  const password = randomBytes(32).toString('hex');
  const identity = process.env.MACOS_SIGNING_IDENTITY;
  let stage = 'private-input-preparation';
  let failureDiagnostic = '';
  let originalSearchList;
  let searchListWriteAttempted = false;
  let keychainCreated = false;
  const privateInputWrites = new Set();
  let signingError;
  let restorationFailed = false;
  let privateCleanupFailed = false;
  let keychainCleanupFailed = false;
  const writePrivateInput = async (path, bytes) => {
    const handle = await open(path, 'wx', 0o600);
    privateInputWrites.add(path);
    try {
      await handle.writeFile(bytes);
    } finally {
      await handle.close();
    }
  };
  const exec = (command, args, artifactKind = 'unknown') => {
    stage =
      command === 'security'
        ? ({
            'create-keychain': 'keychain-create',
            'set-keychain-settings': 'keychain-settings',
            'unlock-keychain': 'keychain-unlock',
            import: 'certificate-import',
            'set-key-partition-list': 'keychain-partition',
            'find-identity': 'signing-identity-preflight',
            'list-keychains': 'keychain-search-list',
            'delete-keychain': 'keychain-cleanup',
          }[args[0]] ?? 'keychain-command')
        : command === 'codesign'
          ? args.includes('--verify')
            ? 'signature-verification'
            : 'artifact-signing'
          : command === 'xcrun'
            ? args[0] === 'notarytool'
              ? 'notarization'
              : 'ticket-stapling'
            : command === 'spctl'
              ? 'gatekeeper-assessment'
              : 'signing-command';
    try {
      return execute(command, args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        ...(command === 'security' &&
        ['find-identity', 'list-keychains'].includes(args[0])
          ? { maxBuffer: identityOutputLimit, timeout: 10000 }
          : {}),
      });
    } catch (error) {
      if (command === 'codesign')
        failureDiagnostic = `; ${codesignDiagnostic(error, artifactKind)}`;
      throw error;
    }
  };
  try {
    originalSearchList = keychainSearchList(
      exec('security', ['list-keychains', '-d', 'user'])
    );
    if (originalSearchList.includes(keychain))
      throw new Error('Owned signing keychain collision');
    stage = 'private-input-ownership';
    for (const path of [keychain, certificate, key]) {
      try {
        await lstat(path);
        throw new Error('Preexisting signing path');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    await writePrivateInput(
      certificate,
      Buffer.from(process.env.MACOS_CERTIFICATE_P12_B64, 'base64')
    );
    await writePrivateInput(
      key,
      Buffer.from(process.env.APP_STORE_CONNECT_PRIVATE_KEY_P8_B64, 'base64')
    );
    exec('security', ['create-keychain', '-p', password, keychain]);
    keychainCreated = true;
    exec('security', ['set-keychain-settings', '-lut', '21600', keychain]);
    exec('security', ['unlock-keychain', '-p', password, keychain]);
    // An explicit codesign keychain does not replace its chain-search list.
    searchListWriteAttempted = true;
    exec('security', [
      'list-keychains',
      '-d',
      'user',
      '-s',
      ...originalSearchList,
      keychain,
    ]);
    const activeSearchList = keychainSearchList(
      exec('security', ['list-keychains', '-d', 'user'])
    );
    if (
      JSON.stringify(activeSearchList) !==
      JSON.stringify([...originalSearchList, keychain])
    )
      throw new Error('Signing keychain search list differs');
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
    // Resolve only the imported keychain; never fall back to a runner identity.
    const fingerprint = importedIdentity(
      exec('security', ['find-identity', '-v', '-p', 'codesigning', keychain]),
      identity
    );
    const sign = (path, artifactKind, entitlements) =>
      exec(
        'codesign',
        [
          '--force',
          '--options',
          'runtime',
          '--timestamp',
          '--sign',
          fingerprint,
          '--keychain',
          keychain,
          ...(entitlements ? ['--entitlements', entitlements] : []),
          path,
        ],
        artifactKind
      );
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
              sign(
                path,
                path.endsWith('.framework')
                  ? 'framework'
                  : path.endsWith('.xpc')
                    ? 'xpc-service'
                    : 'nested-application'
              );
          } else if (stat.isFile()) {
            const bytes = await readRegularFile(path);
            if (
              bytes.length >= 4 &&
              [
                0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe,
                0xbebafeca,
              ].includes(bytes.readUInt32BE(0))
            )
              sign(path, 'mach-o');
          }
        }
        await visit(app);
        sign(
          app,
          'application',
          'apps/mobile/macos/Runner/Release.entitlements'
        );
        exec(
          'codesign',
          ['--verify', '--deep', '--strict', app],
          'application'
        );
        stage = 'signing-team-verification';
        const details = inspect('codesign', ['-d', '--verbose=4', app], {
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
        sign(dmg, 'disk-image');
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
    signingError = new Error(
      `macOS signing failed at ${stage}${failureDiagnostic}; no public release was created`
    );
  } finally {
    if (searchListWriteAttempted) {
      try {
        exec('security', [
          'list-keychains',
          '-d',
          'user',
          '-s',
          ...originalSearchList,
        ]);
        const restored = keychainSearchList(
          exec('security', ['list-keychains', '-d', 'user'])
        );
        restorationFailed =
          JSON.stringify(restored) !== JSON.stringify(originalSearchList);
      } catch {
        restorationFailed = true;
      }
    }
    try {
      if (keychainCreated) exec('security', ['delete-keychain', keychain]);
    } catch {
      keychainCleanupFailed = true;
    }
    const cleanup = await Promise.allSettled(
      [...privateInputWrites].map((path) => rm(path, { force: true }))
    );
    privateCleanupFailed = cleanup.some(
      (result) => result.status === 'rejected'
    );
  }
  if (restorationFailed)
    throw new Error(
      `${signingError ? `${signingError.message}; ` : ''}macOS signing failed at keychain-search-list-restoration; no public release was created`
    );
  if (privateCleanupFailed)
    throw new Error(
      `${signingError ? `${signingError.message}; ` : ''}macOS signing failed at private-input-cleanup; no public release was created`
    );
  if (keychainCleanupFailed)
    throw new Error(
      `${signingError ? `${signingError.message}; ` : ''}macOS signing failed at keychain-cleanup; no public release was created`
    );
  if (signingError) throw signingError;
}
