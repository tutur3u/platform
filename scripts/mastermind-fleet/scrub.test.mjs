import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scrubFleetText as webScrub } from '../../apps/web/src/lib/mastermind/fleet/scrub.ts';
import { countEmoji, fleetText, limitEmoji, scrubFleetText } from './scrub.mjs';

const SAMPLES = [
  'Ship the release? see https://example.com/x and ~/repo/file.ts',
  'Token: ghp_abcdefghijklmnopqrstuvwxyz0123456789 for mail@example.com',
  '***',
  '`code` | [link] > quote # heading',
  `deadbeef${'a'.repeat(40)} 10.0.0.1 123e4567-e89b-12d3-a456-426614174000`,
  'Bearer abc.def secret=hunter2 ‮evil​',
  `Phát hành ${'bản '.repeat(60)}`,
  'ｆｕｌｌｗｉｄｔｈ ﬁ ligature',
  'x'.repeat(300),
  'bearer#example',
  'ok bearer#example and more',
  `${'🚀'.repeat(10)}🇦🚀🇧X`,
];

test('matches the Web scrubber on every sample and cap', () => {
  for (const sample of SAMPLES)
    for (const max of [24, 60, 80, 120, 600])
      assert.equal(scrubFleetText(sample, max), webScrub(sample, max), sample);
});

test('keeps at most ten emoji per field and empties scrubbed-away text', () => {
  const text = limitEmoji(`Ship ${'🚀'.repeat(14)} now 🇻🇳 1️⃣`);
  assert.equal([...text.matchAll(/🚀/g)].length, 10);
  assert.ok(!text.includes('🇻🇳'));
  assert.equal(fleetText('***', 60), '');
  assert.equal(fleetText('https://only.example/link', 60), '');
  assert.equal(fleetText(42, 60), '');
});

test('is a fixed point of the Web scrubber at every cap', () => {
  for (const sample of SAMPLES)
    for (const max of [24, 40, 60, 80, 120, 600]) {
      const sent = fleetText(sample, max);
      assert.ok(sent.length <= max, sample);
      assert.equal(webScrub(sent, max), sent, sample);
    }
});

test('settles text the scrub reshapes and flags formed by removal', () => {
  assert.equal(fleetText('bearer#example', 60), '');
  const flags = fleetText(`${'🚀'.repeat(10)}🇦🚀🇧X`, 60);
  assert.ok(countEmoji(flags) <= 10, flags);
  for (const sample of SAMPLES)
    for (const max of [24, 60, 120]) {
      const sent = fleetText(sample, max);
      assert.ok(countEmoji(sent) <= 10, sample);
      assert.equal(webScrub(sent, max), sent, sample);
    }
});
