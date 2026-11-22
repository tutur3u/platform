import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import {
  scrubFleetBody as webBody,
  scrubFleetText as webScrub,
} from '../../apps/web/src/lib/mastermind/fleet/scrub.ts';
import {
  countEmoji,
  fleetBody,
  scrubFleetBody,
  fleetText,
  limitEmoji,
  scrubFleetText,
} from './scrub.mjs';

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

test('body preserves paragraphs and Markdown and mirrors Web at a fixed point', () => {
  const body = '**Bold**  text\r\n\r\n\r\n- item `code`\r1. item # _ ~ [x] > |';
  const expected = '**Bold** text\n\n- item `code`\n1. item x';
  assert.equal(scrubFleetBody(body, 2000), expected);
  for (const sample of [...SAMPLES, body, 'word '.repeat(600)]) {
    for (const cap of [60, 2000]) {
      assert.equal(scrubFleetBody(sample, cap), webBody(sample, cap));
      const sent = fleetBody(sample, cap);
      assert.equal(webBody(sent, cap), sent);
      assert.ok(countEmoji(sent) <= 10);
    }
  }
});

test('body scrubber implementation remains identical on both sides', () => {
  const web = fs.readFileSync(
    new URL(
      '../../apps/web/src/lib/mastermind/fleet/scrub.ts',
      import.meta.url
    ),
    'utf8'
  );
  const mirror = fs.readFileSync(
    new URL('./scrub.mjs', import.meta.url),
    'utf8'
  );
  const body = (source) =>
    source
      .slice(source.indexOf('export function scrubFleetBody'))
      .split('\n}')[0]
      .replace(/value: string/g, 'value')
      .replace(/maxLength: number/g, 'maxLength')
      .replace(/\): string/g, ')');
  assert.equal(body(web), body(mirror));
});
