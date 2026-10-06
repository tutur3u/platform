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
  MACOS_SIGNING_IDENTITY: 'Developer ID Application: Fixture',
  APPLE_TEAM_ID: 'FIXTURETEAM',
  APP_STORE_CONNECT_API_KEY_ID: 'fixture-key',
  APP_STORE_CONNECT_ISSUER_ID: 'fixture-issuer',
  APP_STORE_CONNECT_PRIVATE_KEY_P8_B64: Buffer.from(
    'fixture-private-key'
  ).toString('base64'),
};
async function fixture(callback) {
  const directory = await mkdtemp(join(tmpdir(), 'desktop-signer-'));
  const previous = Object.fromEntries(
    Object.keys({ ...inputs, RUNNER_TEMP: directory }).map((key) => [
      key,
      process.env[key],
    ])
  );
  Object.assign(process.env, inputs, { RUNNER_TEMP: directory });
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
            return command === 'xcrun' && args[0] === 'notarytool'
              ? JSON.stringify({ status: 'Invalid' })
              : '';
          },
          inspect() {
            return { status: 0, stderr: 'TeamIdentifier=FIXTURETEAM\n' };
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
