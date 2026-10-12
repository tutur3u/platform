import assert from 'node:assert/strict';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { withMacosSigning } from './sign-macos.mjs';

const inputs = {
  MACOS_CERTIFICATE_P12_B64: 'Zml4dHVyZQ==',
  MACOS_CERTIFICATE_PASSWORD: 'synthetic',
  MACOS_SIGNING_IDENTITY: 'Developer ID Application: Fixture (TEAM123456)',
  APPLE_TEAM_ID: 'TEAM123456',
  APP_STORE_CONNECT_API_KEY_ID: 'synthetic',
  APP_STORE_CONNECT_ISSUER_ID: 'synthetic',
  APP_STORE_CONNECT_PRIVATE_KEY_P8_B64: 'Zml4dHVyZQ==',
};

async function fixture(run) {
  const directory = await mkdtemp(join(tmpdir(), 'keychain-list-control-'));
  const values = { ...inputs, DESKTOP_SIGNING_TEMP: directory };
  const previous = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]])
  );
  Object.assign(process.env, values);
  try {
    const app = join(directory, 'Fixture.app');
    await mkdir(app);
    await writeFile(join(app, 'binary'), Buffer.from([0xfe, 0xed, 0xfa, 0xcf]));
    await run({ directory, app });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
}

function transport(directory, failure) {
  const original = [
    '/Users/fixture/Library/Keychains/login.keychain-db',
    '/private/Fixture chain.keychain-db',
  ];
  const owned = join(directory, 'desktop-signing.keychain-db');
  let current = [...original];
  const calls = [];
  return {
    original,
    owned,
    calls,
    get current() {
      return current;
    },
    execute(command, args) {
      calls.push([command, ...args]);
      if (command === 'security' && args[0] === 'list-keychains') {
        if (!args.includes('-s'))
          return current
            .map((name) => `    ${JSON.stringify(name)}`)
            .join('\n');
        current = args.slice(args.indexOf('-s') + 1);
        if (failure === 'append' && current.includes(owned))
          throw new Error('private append failure');
        if (failure === 'restore' && !current.includes(owned))
          throw new Error('private restore failure');
        return '';
      }
      if (command === 'security' && args[0] === 'find-identity') {
        if (failure === 'identity') throw new Error('private identity failure');
        return `1) ${'A'.repeat(40)} "${inputs.MACOS_SIGNING_IDENTITY}"\n1 valid identities found\n`;
      }
      if (command === 'codesign' && args.includes('--sign')) {
        // Model the documented OS requirement, independently of signer implementation.
        if (!current.includes(owned))
          throw new Error(
            'The specified item could not be found in the keychain'
          );
        assert.deepEqual(current, [...original, owned]);
      }
      return '';
    },
    inspect() {
      return { status: 0, stderr: 'TeamIdentifier=TEAM123456\n' };
    },
  };
}

test('real signer makes imported identity discoverable and restores exact caller search list', () =>
  fixture(async ({ directory, app }) => {
    const host = transport(directory);
    await withMacosSigning((signer) => signer.signApp(app), host);
    assert.deepEqual(host.current, host.original);
    const changes = host.calls.filter(
      ([, action, ...args]) =>
        action === 'list-keychains' && args.includes('-s')
    );
    assert.deepEqual(
      changes.map((call) => call.slice(5)),
      [[...host.original, host.owned], host.original]
    );
    const restore = host.calls.indexOf(changes[1]);
    const cleanup = host.calls.findIndex(
      ([, action]) => action === 'delete-keychain'
    );
    assert.ok(restore >= 0 && restore < cleanup);
    assert.ok(!host.calls.some(([, action]) => action === 'default-keychain'));
  }));

for (const failure of ['append', 'identity', 'callback']) {
  test(`restores caller search list after ${failure} failure, including uncertain append`, () =>
    fixture(async ({ directory }) => {
      const host = transport(directory, failure);
      await assert.rejects(
        withMacosSigning(() => {
          throw new Error('private callback failure');
        }, host),
        /macOS signing failed/
      );
      assert.deepEqual(host.current, host.original);
      assert.equal(
        host.calls.filter(([, action]) => action === 'delete-keychain').length,
        1
      );
    }));
}

test('failed search-list restoration cannot acknowledge successful signing or reveal private error', () =>
  fixture(async ({ directory, app }) => {
    const host = transport(directory, 'restore');
    await assert.rejects(
      withMacosSigning((signer) => signer.signApp(app), host),
      (error) => {
        assert.match(error.message, /keychain-search-list-restoration/);
        assert.doesNotMatch(
          error.stack,
          /private restore failure|Fixture chain/
        );
        return true;
      }
    );
  }));

test('a preexisting signing keychain is preserved when snapshot detects a collision', () =>
  fixture(async ({ directory }) => {
    const owned = join(directory, 'desktop-signing.keychain-db');
    const certificate = join(directory, 'desktop-signing.p12');
    await writeFile(owned, 'foreign beforeimage');
    await writeFile(certificate, 'foreign certificate beforeimage');
    const calls = [];
    await assert.rejects(
      withMacosSigning(() => assert.fail('collision must block signing'), {
        execute(command, args) {
          calls.push([command, ...args]);
          return JSON.stringify(owned);
        },
      }),
      /macOS signing failed at keychain-search-list/
    );
    assert.equal(await readFile(owned, 'utf8'), 'foreign beforeimage');
    assert.equal(
      await readFile(certificate, 'utf8'),
      'foreign certificate beforeimage'
    );
    assert.deepEqual(calls, [['security', 'list-keychains', '-d', 'user']]);
  }));

for (const kind of ['keychain', 'certificate', 'notary', 'symlink']) {
  test(`unlisted preexisting ${kind} is never overwritten or deleted`, () =>
    fixture(async ({ directory }) => {
      const name = {
        keychain: 'desktop-signing.keychain-db',
        certificate: 'desktop-signing.p12',
        notary: 'desktop-notary.p8',
        symlink: 'desktop-signing.p12',
      }[kind];
      const foreign = join(directory, name);
      const target = join(directory, 'foreign-target');
      if (kind === 'symlink') {
        await writeFile(target, 'foreign beforeimage');
        await symlink(target, foreign);
      } else await writeFile(foreign, 'foreign beforeimage');
      const host = transport(directory);
      await assert.rejects(
        withMacosSigning(() => {}, host),
        /private-input-ownership/
      );
      assert.equal(await readFile(foreign, 'utf8'), 'foreign beforeimage');
      assert.deepEqual(host.calls, [
        ['security', 'list-keychains', '-d', 'user'],
      ]);
    }));
}

test('uncertain keychain creation never deletes an unacknowledged file', () =>
  fixture(async ({ directory }) => {
    const host = transport(directory);
    const execute = host.execute;
    host.execute = (command, args) => {
      if (command === 'security' && args[0] === 'create-keychain')
        throw new Error('private unknown creation');
      return execute(command, args);
    };
    await assert.rejects(
      withMacosSigning(() => assert.fail('must block'), host),
      /keychain-create/
    );
    assert.ok(!host.calls.some(([, action]) => action === 'delete-keychain'));
  }));

test('private input cleanup errors are redacted and do not acknowledge success', () =>
  fixture(async ({ directory }) => {
    const host = transport(directory);
    await assert.rejects(
      withMacosSigning(async () => {
        const privatePath = join(directory, 'desktop-signing.p12');
        await rm(privatePath);
        await mkdir(privatePath);
      }, host),
      (error) => {
        assert.match(error.message, /private-input-cleanup/);
        assert.doesNotMatch(
          error.stack,
          /EISDIR|desktop-signing.p12|keychain-list-control-/
        );
        return true;
      }
    );
  }));

test('acknowledged keychain cleanup failure blocks success and stays redacted', () =>
  fixture(async ({ directory }) => {
    const host = transport(directory);
    const execute = host.execute;
    host.execute = (command, args) => {
      if (command === 'security' && args[0] === 'delete-keychain')
        throw new Error('private keychain cleanup');
      return execute(command, args);
    };
    await assert.rejects(
      withMacosSigning(() => {}, host),
      (error) => {
        assert.match(error.message, /keychain-cleanup/);
        assert.doesNotMatch(
          error.stack,
          /private keychain cleanup|keychain-list-control-/
        );
        return true;
      }
    );
    assert.deepEqual(host.current, host.original);
  }));

for (const output of [
  'private raw unquoted output',
  '"relative.keychain"',
  '"/private/chain\\nunsafe"',
  Buffer.from('private'),
  'x'.repeat(65537),
]) {
  test('malformed snapshot blocks keychain changes without leaking input', () =>
    fixture(async () => {
      const calls = [];
      await assert.rejects(
        withMacosSigning(() => assert.fail('invalid snapshot'), {
          execute(command, args) {
            calls.push([command, ...args]);
            return output;
          },
        }),
        (error) => {
          assert.match(error.message, /keychain-search-list/);
          assert.doesNotMatch(
            error.stack,
            /private raw|relative.keychain|unsafe/
          );
          return true;
        }
      );
      assert.deepEqual(calls, [['security', 'list-keychains', '-d', 'user']]);
    }));
}
