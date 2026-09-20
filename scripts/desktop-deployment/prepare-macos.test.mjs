import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { prepareMacos } from './prepare-macos.mjs';

async function fixture(callback) {
  const root = await mkdtemp(join(tmpdir(), 'desktop-firebase-'));
  try {
    await mkdir(join(root, 'macos/Runner'), { recursive: true });
    for (const flavor of ['development', 'staging', 'production']) {
      await writeFile(
        join(root, `macos/Runner/GoogleService-Info-${flavor}.plist`),
        `<plist><dict><key>GOOGLE_APP_ID</key><string>app-${flavor}</string><key>PROJECT_ID</key><string>tuturuuu-mobile</string></dict></plist>`
      );
    }
    await callback(root);
  } finally {
    await rm(root, { recursive: true });
  }
}

test('prepares all macOS configurations while preserving other platforms', () =>
  fixture(async (root) => {
    const ios = {
      buildConfigurations: { 'Release-production': { appId: 'ios' } },
    };
    await writeFile(
      join(root, 'firebase.json'),
      JSON.stringify({ flutter: { platforms: { ios } } })
    );
    await prepareMacos(root);
    const metadata = JSON.parse(
      await readFile(join(root, 'firebase.json'), 'utf8')
    );
    assert.deepEqual(metadata.flutter.platforms.ios, ios);
    const configs = metadata.flutter.platforms.macos.buildConfigurations;
    assert.equal(Object.keys(configs).length, 9);
    assert.equal(configs['Release-production'].appId, 'app-production');
    assert.equal(configs['Debug-development'].uploadDebugSymbols, false);
    assert.equal(
      await readFile(
        join(root, 'macos/Runner/GoogleService-Info.plist'),
        'utf8'
      ),
      await readFile(
        join(root, 'macos/Runner/GoogleService-Info-production.plist'),
        'utf8'
      )
    );
  }));

test('rejects an unexpected Firebase project without overwriting metadata', () =>
  fixture(async (root) => {
    await writeFile(join(root, 'firebase.json'), '{"existing":true}');
    await writeFile(
      join(root, 'macos/Runner/GoogleService-Info-production.plist'),
      '<plist><key>GOOGLE_APP_ID</key><string>app</string><key>PROJECT_ID</key><string>other</string></plist>'
    );
    await assert.rejects(prepareMacos(root), /Invalid macOS Firebase identity/);
    assert.equal(
      await readFile(join(root, 'firebase.json'), 'utf8'),
      '{"existing":true}'
    );
  }));
