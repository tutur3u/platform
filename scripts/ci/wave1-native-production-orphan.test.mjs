import assert from 'node:assert/strict';
import test from 'node:test';
import { oldId, setup, sha } from './wave1-native-production-test-helper.mjs';

for (const [name, annotations] of [
  [
    'resolved source SHA',
    {
      'workers/message': 'ac8beee09e9700b453a55e193db5957985e01956',
      'workers/tag': 'unrelated',
    },
  ],
  [
    'second resolved source SHA',
    {
      'workers/message': '766c457a4c17797c6b62bb4a8a5c607bdfa0b91b',
      'workers/tag': 'unrelated',
    },
  ],
  [
    'second resolved artifact digest',
    {
      'workers/message': 'unrelated',
      'workers/tag':
        '6dec01d9d95a94cfe543afddc402ea15cb4b1018d03fd335aaca08463b2ba51b',
    },
  ],
  [
    'resolved artifact digest',
    {
      'workers/message': 'unrelated',
      'workers/tag':
        '2116459bf121f09a7a714889d13d291a9823b451285747602a67eb0e50435b97',
    },
  ],
])
  test(`${name} orphan refuses during read-only preflight`, async (t) => {
    const p = setup(t);
    p.state.ids = [oldId];
    p.state.versionAnnotations = annotations;
    const env = { ...p.env };
    delete env.WAVE1_PRODUCTION_CLOUDFLARE_API_TOKEN;
    await assert.rejects(
      p.run({ argv: ['calendar', sha, 'preflight'], env }),
      /Resolved no-write/u
    );
    assert.equal(p.state.writes, 0);
  });

test('an unrelated hosted version does not trigger the orphan refusal', async (t) => {
  const p = setup(t);
  p.state.ids = [oldId];
  p.state.versionAnnotations = {
    'workers/message': 'unrelated',
    'workers/tag': 'unrelated',
  };
  const env = { ...p.env };
  delete env.WAVE1_PRODUCTION_CLOUDFLARE_API_TOKEN;
  const result = await p.run({ argv: ['calendar', sha, 'preflight'], env });
  assert.equal(result.state, 'preflight');
  assert.equal(p.state.writes, 0);
});
