import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareTunnelDraft } from './prepare-tunnel.mjs';

function snapshot() {
  return {
    success: true,
    result: {
      tunnel_id: '774433a2-f284-4fdd-80d5-eaab0ab99fcd',
      source: 'cloudflare',
      version: 18,
      config: {
        ingress: [
          {
            service: 'http://localhost:7803',
            hostname: 'tuturuuu.com',
            originRequest: { connectTimeout: 30 },
          },
          { service: 'http://localhost:7814', hostname: 'hive.tuturuuu.com' },
          { service: 'http_status:404' },
        ],
        'warp-routing': { enabled: false },
        originRequest: { noTLSVerify: false },
      },
    },
  };
}

test('only Hive is removed; all surviving rule bytes and global options remain identical', () => {
  const response = snapshot();
  const original = JSON.stringify(response);
  const { before, after } = prepareTunnelDraft(response, 18);
  assert.equal(JSON.stringify(response), original);
  assert.equal(
    JSON.stringify(before.config.ingress[0]),
    JSON.stringify(after.config.ingress[0])
  );
  assert.equal(
    JSON.stringify(before.config.ingress[2]),
    JSON.stringify(after.config.ingress[1])
  );
  assert.deepEqual(after.config, {
    ...before.config,
    ingress: [before.config.ingress[0], before.config.ingress[2]],
  });
});

test('stale versions, changed identity and unexpected rules stop the draft', () => {
  for (const change of [
    (r) => {
      r.result.version++;
    },
    (r) => {
      r.result.tunnel_id = 'another-tunnel';
    },
    (r) => {
      r.result.source = 'local';
    },
    (r) => {
      r.result.config.ingress[0].service = 'http://localhost:9999';
    },
    (r) => {
      r.result.config.ingress[1].service = 'http://localhost:9999';
    },
    (r) => {
      r.result.config.ingress.splice(1, 0, {
        hostname: 'new.example',
        service: 'http://localhost:9999',
      });
    },
    (r) => {
      r.result.config.ingress.pop();
    },
    (r) => {
      r.result.config.ingress[1].hostname = 'other.tuturuuu.com';
    },
  ]) {
    const response = snapshot();
    change(response);
    assert.throws(() => prepareTunnelDraft(response, 18));
  }
});
