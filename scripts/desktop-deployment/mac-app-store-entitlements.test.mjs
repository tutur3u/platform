import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  machOKind,
  renderEntitlements,
  verifyProfile,
} from './mac-app-store-entitlements.mjs';

const teamId = 'ABCDE12345';
const appId = `${teamId}.com.tuturuuu.app.mobile`;

async function storeEntitlements() {
  const path = 'apps/mobile/macos/Runner/AppStore.entitlements';
  if (process.platform === 'darwin')
    return JSON.parse(
      execFileSync('plutil', ['-convert', 'json', '-o', '-', path], {
        encoding: 'utf8',
      })
    );
  // Non-macOS runners only check the sandbox key exists in the source file.
  const xml = await readFile(path, 'utf8');
  assert.match(
    xml,
    /<key>com\.apple\.security\.app-sandbox<\/key>\s*<true\/>/u
  );
  return {
    'com.apple.security.app-sandbox': true,
    'keychain-access-groups': [
      '$(AppIdentifierPrefix)$(PRODUCT_BUNDLE_IDENTIFIER)',
    ],
  };
}

function profile(overrides = {}) {
  return {
    UUID: 'profile-uuid',
    Platform: ['OSX'],
    TeamIdentifier: [teamId],
    ExpirationDate: '2099-01-01T00:00:00Z',
    Entitlements: {
      'com.apple.application-identifier': appId,
      'com.apple.developer.team-identifier': teamId,
      'keychain-access-groups': [`${teamId}.*`],
      'com.apple.developer.applesignin': ['Default'],
      'com.apple.developer.associated-domains': '*',
      'com.apple.developer.aps-environment': 'production',
      ...overrides,
    },
  };
}

test('store entitlements are sandboxed and resolve every Xcode variable', async () => {
  const rendered = renderEntitlements(await storeEntitlements(), { teamId });
  assert.equal(rendered['com.apple.security.app-sandbox'], true);
  assert.equal(rendered['com.apple.application-identifier'], appId);
  assert.deepEqual(rendered['keychain-access-groups'], [appId]);
  assert.doesNotMatch(JSON.stringify(rendered), /\$\(/u);
});

test('store entitlements never ship the in-app updater or JIT exceptions', async () => {
  const source = await storeEntitlements();
  for (const key of Object.keys(source))
    assert.doesNotMatch(key, /^com\.apple\.security\.cs\./u);
});

test('rendering refuses unsandboxed sources and unknown variables', () => {
  assert.throws(() => renderEntitlements({}, { teamId }), /sandbox/u);
  assert.throws(
    () =>
      renderEntitlements(
        { 'com.apple.security.app-sandbox': true, x: '$(UNKNOWN)' },
        { teamId }
      ),
    /Unresolved/u
  );
});

test('profile must cover every non-sandbox entitlement', async () => {
  const rendered = renderEntitlements(await storeEntitlements(), { teamId });
  assert.equal(verifyProfile(profile(), rendered, { teamId }), 'profile-uuid');
  const withoutSignIn = profile();
  delete withoutSignIn.Entitlements['com.apple.developer.applesignin'];
  const needsSignIn = {
    ...rendered,
    'com.apple.developer.applesignin': ['Default'],
  };
  assert.throws(
    () => verifyProfile(withoutSignIn, needsSignIn, { teamId }),
    /applesignin/u
  );
});

test('profile must be an unexpired macOS store profile for this team', () => {
  const rendered = { 'com.apple.application-identifier': appId };
  assert.throws(
    () =>
      verifyProfile({ ...profile(), Platform: ['iOS'] }, rendered, { teamId }),
    /macOS/u
  );
  assert.throws(
    () =>
      verifyProfile({ ...profile(), ProvisionedDevices: ['x'] }, rendered, {
        teamId,
      }),
    /distribution/u
  );
  assert.throws(
    () =>
      verifyProfile({ ...profile(), ExpirationDate: '2000-01-01' }, rendered, {
        teamId,
      }),
    /expired/u
  );
  assert.throws(
    () =>
      verifyProfile(profile({ 'get-task-allow': true }), rendered, { teamId }),
    /debugging/u
  );
});

test('classifies thin and universal Mach-O files', () => {
  const thin = (type) => {
    const bytes = Buffer.alloc(32);
    bytes.writeUInt32BE(0xcffaedfe, 0);
    bytes.writeUInt32LE(type, 12);
    return bytes;
  };
  assert.equal(machOKind(thin(2)), 'executable');
  assert.equal(machOKind(thin(6)), 'library');
  const fat = Buffer.alloc(64);
  fat.writeUInt32BE(0xcafebabe, 0);
  fat.writeUInt32BE(1, 4);
  fat.writeUInt32BE(32, 16);
  thin(2).copy(fat, 32);
  assert.equal(machOKind(fat), 'executable');
  assert.equal(machOKind(Buffer.from('#!/bin/sh\n echo hi\n')), null);
});
