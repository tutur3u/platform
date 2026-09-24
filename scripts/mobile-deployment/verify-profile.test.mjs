import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('App Store profile validation rejects incompatible or expired signing assets', {
  skip: process.platform !== 'darwin',
}, (t) => {
  const root = mkdtempSync(join(tmpdir(), 'mobile-profile-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const executable = join(root, 'verify-profile');
  execFileSync(
    'swiftc',
    ['scripts/mobile-deployment/verify-profile.swift', '-o', executable],
    { stdio: 'pipe' }
  );
  const env = {
    ...process.env,
    APPLE_TEAM_ID: 'TESTTEAM01',
    APPLE_BUNDLE_ID: 'com.tuturuuu.app.mobile',
  };
  const base = `<?xml version="1.0"?><plist version="1.0"><dict>
    <key>UUID</key><string>12345678-1234-1234-1234-123456789012</string>
    <key>TeamIdentifier</key><array><string>TESTTEAM01</string></array>
    <key>ExpirationDate</key><date>2099-01-01T00:00:00Z</date>
    <key>Entitlements</key><dict>
      <key>application-identifier</key><string>TESTTEAM01.com.tuturuuu.app.mobile</string>
      <key>get-task-allow</key><false/>
      <key>aps-environment</key><string>production</string>
    </dict></dict></plist>`;
  const fixtures = [
    [base, 0],
    [base.replace('2099-01-01', '2000-01-01'), 1],
    [
      base.replace(
        '<key>get-task-allow</key><false/>',
        '<key>get-task-allow</key><true/>'
      ),
      1,
    ],
    [base.replace('com.tuturuuu.app.mobile', 'com.example.other'), 1],
    [
      base.replace(
        '<string>production</string>',
        '<string>development</string>'
      ),
      1,
    ],
    [
      base.replace(
        '<key>Entitlements</key>',
        '<key>ProvisionedDevices</key><array/><key>Entitlements</key>'
      ),
      1,
    ],
    [
      base.replace(
        '<key>Entitlements</key>',
        '<key>ProvisionsAllDevices</key><true/><key>Entitlements</key>'
      ),
      1,
    ],
  ];
  for (const [index, [profile, status]] of fixtures.entries()) {
    const path = join(root, `${index}.plist`);
    writeFileSync(path, profile);
    const result = spawnSync(executable, [path], { env, encoding: 'utf8' });
    assert.equal(result.status, status, `fixture ${index}: ${result.stderr}`);
  }
  const sharedGroup =
    '<key>com.apple.security.application-groups</key><array><string>group.com.tuturuuu.app.mobile.live</string></array>';
  const liveProfile = base.replace(
    '<key>get-task-allow</key>',
    `${sharedGroup}<key>get-task-allow</key>`
  );
  const broadcast = liveProfile
    .replace(
      'TESTTEAM01.com.tuturuuu.app.mobile</string>',
      'TESTTEAM01.com.tuturuuu.app.mobile.LiveScreenBroadcast</string>'
    )
    .replace('<key>aps-environment</key><string>production</string>', '');
  for (const [index, [profile, extraEnv, status]] of [
    [base, { APPLE_LIVE_SCREEN_GROUP_REQUIRED: 'true' }, 1],
    [liveProfile, { APPLE_LIVE_SCREEN_GROUP_REQUIRED: 'true' }, 0],
    [broadcast, { APPLE_PROFILE_KIND: 'broadcast' }, 0],
    [liveProfile, { APPLE_PROFILE_KIND: 'broadcast' }, 1],
    [
      broadcast.replace(sharedGroup, ''),
      { APPLE_PROFILE_KIND: 'broadcast' },
      1,
    ],
  ].entries()) {
    const path = join(root, `live-${index}.plist`);
    writeFileSync(path, profile);
    const result = spawnSync(executable, [path], {
      env: { ...env, ...extraEnv },
      encoding: 'utf8',
    });
    assert.equal(
      result.status,
      status,
      `live fixture ${index}: ${result.stderr}`
    );
  }
});
