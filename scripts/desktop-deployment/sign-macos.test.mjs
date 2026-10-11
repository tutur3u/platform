import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { withMacosSigning } from './sign-macos.mjs';

const inputs = {
  MACOS_CERTIFICATE_P12_B64: Buffer.from('fixture-certificate').toString(
    'base64'
  ),
  MACOS_CERTIFICATE_PASSWORD: 'fixture-password',
  MACOS_SIGNING_IDENTITY: 'Developer ID Application: Fixture (TEAM123456)',
  APPLE_TEAM_ID: 'TEAM123456',
  APP_STORE_CONNECT_API_KEY_ID: 'fixture-key',
  APP_STORE_CONNECT_ISSUER_ID: 'fixture-issuer',
  APP_STORE_CONNECT_PRIVATE_KEY_P8_B64: Buffer.from(
    'fixture-private-key'
  ).toString('base64'),
};
const fingerprint = 'A'.repeat(40);
const identityRow = (
  hash = fingerprint,
  name = inputs.MACOS_SIGNING_IDENTITY
) => `1) ${hash} "${name}"`;
const validIdentities = `${identityRow()}\n1 valid identities found\n`;
const preflightFailure =
  'macOS signing failed at signing-identity-preflight; no public release was created';
async function fixture(callback) {
  const directory = await mkdtemp(join(tmpdir(), 'desktop-signer-'));
  const previous = Object.fromEntries(
    Object.keys({
      ...inputs,
      RUNNER_TEMP: directory,
      DESKTOP_SIGNING_TEMP: directory,
    }).map((key) => [key, process.env[key]])
  );
  Object.assign(process.env, inputs, {
    RUNNER_TEMP: directory,
    DESKTOP_SIGNING_TEMP: directory,
  });
  try {
    await callback(directory);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
}

for (const duplicate of [false, true]) {
  test(`valid imported identity signs with its fingerprint${duplicate ? ' after deterministic deduplication' : ''}`, async () =>
    fixture(async (directory) => {
      const app = join(directory, 'Fixture.app');
      await mkdir(app);
      await writeFile(
        join(app, 'binary'),
        Buffer.from([0xfe, 0xed, 0xfa, 0xcf])
      );
      const commands = [];
      await withMacosSigning(
        async (signer) => {
          commands.push(['callback']);
          await signer.signApp(app);
          await signer.notarize(join(directory, 'fixture.dmg'));
        },
        {
          execute(command, args, options) {
            commands.push([command, ...args]);
            assert.deepEqual(options.stdio, ['ignore', 'pipe', 'pipe']);
            if (command === 'security' && args[0] === 'find-identity') {
              assert.deepEqual(args, [
                'find-identity',
                '-v',
                '-p',
                'codesigning',
                join(directory, 'desktop-signing.keychain-db'),
              ]);
              assert.equal(options.maxBuffer, 65536);
              assert.equal(options.timeout, 10000);
              return duplicate
                ? `${identityRow()}\n${identityRow(fingerprint.toLowerCase())}\n2 valid identities found\n`
                : validIdentities;
            }
            return command === 'xcrun' && args[0] === 'notarytool'
              ? JSON.stringify({ status: 'Accepted' })
              : '';
          },
          inspect(command, args) {
            assert.equal(command, 'codesign');
            assert.deepEqual(args, ['-d', '--verbose=4', app]);
            return { status: 0, stderr: 'TeamIdentifier=TEAM123456\n' };
          },
        }
      );
      const at = (action) => commands.findIndex(([, name]) => name === action);
      assert.ok(at('import') < at('set-key-partition-list'));
      assert.ok(at('set-key-partition-list') < at('find-identity'));
      assert.ok(
        at('find-identity') <
          commands.findIndex(([name]) => name === 'callback')
      );
      const signatures = commands.filter(
        ([command, ...args]) =>
          command === 'codesign' && args.includes('--sign')
      );
      assert.equal(signatures.length, 3);
      for (const [, ...args] of signatures) {
        assert.equal(args[args.indexOf('--sign') + 1], fingerprint);
        assert.equal(
          args[args.indexOf('--keychain') + 1],
          join(directory, 'desktop-signing.keychain-db')
        );
        assert.ok(args.includes('--timestamp'));
        assert.equal(args[args.indexOf('--options') + 1], 'runtime');
      }
      assert.ok(
        commands.some(([, ...args]) => args.includes('--entitlements'))
      );
      assert.ok(
        commands.some(
          ([command, ...args]) =>
            command === 'codesign' &&
            args.join(' ') === `--verify --deep --strict ${app}`
        )
      );
      assert.deepEqual(
        commands
          .filter(
            ([command, action]) => command === 'xcrun' && action === 'stapler'
          )
          .map(([, , action]) => action),
        ['staple', 'validate']
      );
      assert.ok(commands.some(([command]) => command === 'spctl'));
      assert.ok(commands.some(([, action]) => action === 'delete-keychain'));
    }));
}

const rejectedListings = [
  ['missing identity', '0 valid identities found\n'],
  ['missing valid summary', `${identityRow()}\n`],
  ['summary count mismatch', `${identityRow()}\n0 valid identities found\n`],
  [
    'wrong common name',
    `${identityRow(fingerprint, 'Developer ID Application: Other (TEAM123456)')}\n1 valid identities found\n`,
  ],
  [
    'wrong team',
    `${identityRow(fingerprint, 'Developer ID Application: Fixture (OTHER12345)')}\n1 valid identities found\n`,
  ],
  [
    'installer identity',
    `${identityRow(fingerprint, 'Developer ID Installer: Fixture (TEAM123456)')}\n1 valid identities found\n`,
  ],
  [
    'development identity',
    `${identityRow(fingerprint, 'Apple Development: Fixture (TEAM123456)')}\n1 valid identities found\n`,
  ],
  [
    'two distinct fingerprints',
    `${identityRow()}\n${identityRow('B'.repeat(40))}\n2 valid identities found\n`,
  ],
  [
    'malformed fingerprint',
    `${identityRow('not-a-fingerprint')}\n1 valid identities found\n`,
  ],
  [
    'invalid certificate suffix',
    `${identityRow()} (CSSMERR_TP_CERT_EXPIRED)\n1 valid identities found\n`,
  ],
  [
    'unexpected private output',
    `${validIdentities}private-output fixture-private-key\n`,
  ],
  ['row after summary', `1 valid identities found\n${identityRow()}\n`],
  ['multiple summaries', `${validIdentities}1 valid identities found\n`],
  ['non-string output', Buffer.from(validIdentities)],
  ['oversized output', 'x'.repeat(65537)],
];
for (const [label, listing] of rejectedListings) {
  test(`identity preflight blocks ${label} before any signer callback`, async () =>
    fixture(async (directory) => {
      const commands = [];
      await assert.rejects(
        withMacosSigning(() => assert.fail('preflight must block callback'), {
          execute(command, args) {
            commands.push([command, ...args]);
            return command === 'security' && args[0] === 'find-identity'
              ? listing
              : '';
          },
          inspect() {
            assert.fail('preflight must block inspection');
          },
        }),
        (error) => {
          assert.equal(error.message, preflightFailure);
          assert.equal(error.cause, undefined);
          assert.doesNotMatch(
            error.stack,
            /fixture-private-key|private-output|Developer ID/
          );
          return true;
        }
      );
      assert.ok(commands.every(([command]) => command === 'security'));
      assert.deepEqual(commands.at(-1), [
        'security',
        'delete-keychain',
        join(directory, 'desktop-signing.keychain-db'),
      ]);
      for (const name of ['desktop-signing.p12', 'desktop-notary.p8']) {
        await assert.rejects(readFile(join(directory, name)), {
          code: 'ENOENT',
        });
      }
    }));
}

test('identity lookup child errors stay private and clean owned inputs', async () =>
  fixture(async (directory) => {
    const commands = [];
    await assert.rejects(
      withMacosSigning(() => assert.fail('must not call signer'), {
        execute(command, args) {
          commands.push([command, ...args]);
          if (args[0] === 'find-identity') {
            const error = new Error('private-password /private/identity');
            error.stderr = 'fixture-private-key';
            error.stdout = validIdentities;
            throw error;
          }
          return '';
        },
      }),
      (error) => {
        assert.equal(error.message, preflightFailure);
        assert.equal(error.cause, undefined);
        assert.doesNotMatch(
          error.stack,
          /private-password|private-key|\/private\/identity/
        );
        return true;
      }
    );
    assert.ok(commands.every(([command]) => command === 'security'));
    assert.equal(commands.at(-1)[1], 'delete-keychain');
    for (const name of ['desktop-signing.p12', 'desktop-notary.p8']) {
      await assert.rejects(readFile(join(directory, name)), { code: 'ENOENT' });
    }
  }));

for (const [name, value] of [
  ['MACOS_SIGNING_IDENTITY', '-'],
  ['MACOS_SIGNING_IDENTITY', 'Developer ID Installer: Fixture (TEAM123456)'],
  ['MACOS_SIGNING_IDENTITY', 'Developer ID Application: Fixture (OTHER12345)'],
  ['MACOS_SIGNING_IDENTITY', 'Developer ID Application: Fixture\n(TEAM123456)'],
  [
    'MACOS_SIGNING_IDENTITY',
    `Developer ID Application: ${'x'.repeat(1024)} (TEAM123456)`,
  ],
  ['APPLE_TEAM_ID', 'TEAM123456\n'],
]) {
  test(`invalid configured selector ${name} is rejected without commands: ${value.length}`, async () =>
    fixture(async () => {
      process.env[name] = value;
      await assert.rejects(
        withMacosSigning(() => assert.fail('must not call signer'), {
          execute() {
            assert.fail('invalid selector must not reach security');
          },
        }),
        {
          message:
            'macOS beta publication requires Developer ID signing and notarization credentials',
        }
      );
    }));
}
test('import failure exposes only a fixed stage and cleans private files', async () =>
  fixture(async (directory) => {
    const commands = [];
    await assert.rejects(
      withMacosSigning(() => assert.fail('must not execute signing'), {
        execute(command, args) {
          commands.push([command, args[0]]);
          if (args[0] === 'import')
            throw new Error(
              'fixture-password fixture-private-key arbitrary-stderr'
            );
          return '';
        },
      }),
      (error) =>
        error.message ===
        'macOS signing failed at certificate-import; no public release was created'
    );
    assert.ok(commands.some(([, action]) => action === 'delete-keychain'));
    await assert.rejects(readFile(join(directory, 'desktop-signing.p12')), {
      code: 'ENOENT',
    });
    await assert.rejects(readFile(join(directory, 'desktop-notary.p8')), {
      code: 'ENOENT',
    });
  }));
test('notary rejection retains strict signing and never staples', async () =>
  fixture(async (directory) => {
    const app = join(directory, 'Fixture.app');
    await mkdir(app);
    await writeFile(join(app, 'binary'), Buffer.from([0xfe, 0xed, 0xfa, 0xcf]));
    const commands = [];
    await assert.rejects(
      withMacosSigning(
        async (signer) => {
          await signer.signApp(app);
          await signer.notarize(join(directory, 'fixture.dmg'));
        },
        {
          execute(command, args) {
            commands.push([command, ...args]);
            if (command === 'security' && args[0] === 'find-identity')
              return validIdentities;
            return command === 'xcrun' && args[0] === 'notarytool'
              ? JSON.stringify({ status: 'Invalid' })
              : '';
          },
          inspect() {
            return { status: 0, stderr: 'TeamIdentifier=TEAM123456\n' };
          },
        }
      ),
      /failed at notarization;/
    );
    assert.ok(
      commands.some(
        ([command, ...args]) =>
          command === 'codesign' && args.includes('--strict')
      )
    );
    assert.ok(
      !commands.some(
        ([command, action]) => command === 'xcrun' && action === 'stapler'
      )
    );
  }));

for (const verification of [false, true]) {
  test(`real codesign child failure stays private during ${verification ? 'verification' : 'signing'}`, async () =>
    fixture(async (directory) => {
      const app = join(directory, 'Fixture.app');
      await mkdir(app);
      const commands = [];
      await assert.rejects(
        withMacosSigning((signer) => signer.signApp(app), {
          execute(command, args, options) {
            commands.push([command, ...args]);
            if (command === 'security' && args[0] === 'find-identity')
              return validIdentities;
            if (
              command === 'codesign' &&
              args.includes('--verify') === verification
            ) {
              return execFileSync(
                process.execPath,
                [
                  '-e',
                  'process.stdout.write("private-output"); process.stderr.write("errSecInternalComponent private-password /private/identity fixture-private-key"); process.exit(7);',
                ],
                options
              );
            }
            return '';
          },
          inspect() {
            assert.fail('failed codesign must not reach team inspection');
          },
        }),
        (error) => {
          assert.equal(
            error.message,
            `macOS signing failed at ${verification ? 'signature-verification' : 'artifact-signing'}; codesign category=keychain-access artifact=application exit=7; no public release was created`
          );
          assert.equal(error.cause, undefined);
          assert.doesNotMatch(
            error.stack,
            /private-output|private-password|\/private\/identity|fixture-private-key/
          );
          return true;
        }
      );
      assert.ok(commands.some(([, action]) => action === 'delete-keychain'));
      assert.ok(
        !commands.some(
          ([command]) => command === 'xcrun' || command === 'spctl'
        )
      );
      await assert.rejects(readFile(join(directory, 'desktop-signing.p12')), {
        code: 'ENOENT',
      });
      await assert.rejects(readFile(join(directory, 'desktop-notary.p8')), {
        code: 'ENOENT',
      });
    }));
}
