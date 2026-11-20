import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  publishGatewayVersionOnly,
  rehearseGatewayCfPublication,
  writeMergedDeployConfig,
} from './gateway-cf-publication.mjs';
import { cfPrebuiltArgs } from './cf-build-output-publisher.mjs';

const fixture = new URL(
  './fixtures/gateway-settings-fixture.json',
  import.meta.url
);
const gatewayRoot = fileURLToPath(
  new URL('../../apps/gateway', import.meta.url)
);

test('version-only cf args match M4 gateway publication contract', () => {
  const args = cfPrebuiltArgs({
    traffic: 'version-only',
    dryRun: false,
    sha: 'a'.repeat(40),
    digest: 'd'.repeat(64),
    workerName: 'tuturuuu-gateway',
  });
  assert.ok(args.includes('versions'));
  assert.ok(args.includes('--prebuilt'));
  assert.equal(args.includes('deploy'), false);
});

test('merged deploy config preserves gateway merge parity', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gateway-cf-'));
  try {
    const out = join(dir, 'wrangler.deploy.json');
    const settingsPath = fileURLToPath(fixture);
    const config = writeMergedDeployConfig(settingsPath, out, {
      GATEWAY_WEB_FAMILIES: '',
      WEB_ORIGIN: 'https://web.example.vercel.app',
      MARKETING_ORIGIN: 'https://marketing.example.workers.dev',
    });
    assert.equal(config.name, 'tuturuuu-gateway');
    assert.ok(readFileSync(out, 'utf8').includes('tuturuuu-gateway'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('publish-version-only requires owner LIVE gate', () => {
  assert.throws(
    () =>
      publishGatewayVersionOnly({
        settingsPath: fileURLToPath(fixture),
        env: {
          GATEWAY_CF_VERSION_UPLOAD_LIVE: 'false',
          CLOUDFLARE_API_TOKEN: 'token',
          CLOUDFLARE_ACCOUNT_ID: 'account',
          RUNNER_TEMP: mkdtempSync(join(tmpdir(), 'gw-live-')),
        },
        cfToken: 'token',
        accountId: 'account',
        sha: 'b'.repeat(40),
        digest: 'c'.repeat(64),
      }),
    /GATEWAY_CF_VERSION_UPLOAD_LIVE|'false' !== 'true'/
  );
});

test('rehearse rejects credentials and requires rehearsal flag', () => {
  assert.throws(
    () =>
      rehearseGatewayCfPublication({
        settingsPath: fileURLToPath(fixture),
        env: {
          GATEWAY_PUBLICATION_REHEARSAL: '1',
          CLOUDFLARE_API_TOKEN: 'secret',
          RUNNER_TEMP: mkdtempSync(join(tmpdir(), 'gw-')),
        },
      }),
    /forbids deploy credentials/
  );
});
