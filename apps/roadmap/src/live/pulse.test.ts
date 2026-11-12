/** D79: the shipping pulse and the Upskii links. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import en from '../../messages/en.json' with { type: 'json' };
import vi from '../../messages/vi.json' with { type: 'json' };
import type { PrFact } from './model.ts';
import { shippingPulse } from './pulse.ts';

const pr = (
  number: number,
  mergedAt: string | null,
  state: PrFact['state'] = 'merged'
): PrFact => ({
  number,
  title: `PR ${number}`,
  state,
  draft: false,
  approved: true,
  mergedAt,
});

describe('shipping pulse', () => {
  const now = Date.parse('2026-11-11T05:00:00Z'); // 12:00 in Vietnam
  it('counts merged PRs per Vietnam day over the window, oldest first', () => {
    const pulse = shippingPulse(
      [
        pr(1, '2026-11-11T01:00:00Z'),
        pr(2, '2026-11-10T18:30:00Z'), // 01:30 on 11 Nov in Vietnam
        pr(3, '2026-11-10T10:00:00Z'),
        pr(4, '2026-10-01T10:00:00Z'), // outside the window
        pr(5, null, 'open'),
        pr(6, '2026-11-09T10:00:00Z', 'closed'),
      ],
      now,
      3
    );
    assert.deepEqual(pulse, [
      { day: '2026-11-09', merged: 0 },
      { day: '2026-11-10', merged: 1 },
      { day: '2026-11-11', merged: 2 },
    ]);
  });

  it('broken variant: a merge in the future is not counted', () => {
    const pulse = shippingPulse([pr(1, '2026-11-11T09:00:00Z')], now, 1);
    assert.deepEqual(pulse, [{ day: '2026-11-11', merged: 0 }]);
  });

  it('has EN/VI copy for the pulse and the glance', () => {
    for (const messages of [en, vi]) {
      assert.ok(
        messages.pulse.title && messages.pulse.source && messages.pulse.table
      );
      assert.ok(messages.glance.title && messages.glance.shipped);
    }
  });
});

describe('Upskii is the official mark and always linked', () => {
  it('ships the official logo from upskii/platform, byte for byte', () => {
    const bytes = readFileSync(
      new URL('../assets/upskii-official-logo.png', import.meta.url)
    );
    // apps/marketing/public/official-logo.png in upskii/platform (dc2eb53b93).
    assert.equal(
      createHash('sha256').update(bytes).digest('hex').slice(0, 16),
      '1970a7ffa1096e4d'
    );
  });

  it('renders a small downscale of that official logo, not the 998px original', () => {
    const png = readFileSync(
      new URL('../assets/upskii-logo-96.png', import.meta.url)
    );
    // PNG IHDR: width and height are the big-endian words at bytes 16 and 20.
    assert.equal(png.readUInt32BE(16), 96);
    assert.equal(png.readUInt32BE(20), 96);
    assert.ok(png.length < 20_000, `${png.length} bytes`);
    const source = readFileSync(
      new URL('../components/workshop.tsx', import.meta.url),
      'utf8'
    );
    assert.ok(source.includes("from '../assets/upskii-logo-96.png?no-inline'"));
    assert.ok(!source.includes("upskii-official-logo.png?no-inline'"));
  });

  it('every rendered Upskii mention goes through a linking helper', () => {
    const source = readFileSync(
      new URL('../components/workshop.tsx', import.meta.url),
      'utf8'
    );
    assert.match(source, /export const UPSKII_URL = 'https:\/\/upskii\.com';/);
    for (const field of [
      't.agenda.items[id].title',
      't.agenda.items[id].body',
      't.tools.subtitle',
      'copy.title',
    ])
      assert.ok(source.includes(`<UpskiiText text={${field}} />`), field);
    assert.match(
      source,
      /<UpskiiLink>\{t\.tools\.names\.upskii\}<\/UpskiiLink>/
    );
    // Broken variant: a bare Upskii brand string outside the helpers.
    // The brand card is itself an <a href={UPSKII_URL}>, so its name is linked.
    assert.match(
      source,
      /className="ws-brand ws-brand-link"\s+href=\{UPSKII_URL\}/
    );
    const bare = source
      .replace(/<a\s+className="ws-brand ws-brand-link"[\s\S]*?<\/a>/g, '')
      .replace(
        /<UpskiiLink[\s\S]*?<\/UpskiiLink>|UpskiiText|UpskiiMark|className="ws-upskii[^"]*"/g,
        ''
      );
    assert.doesNotMatch(
      bare,
      /<strong>Upskii<\/strong>|>Upskii</,
      'unlinked Upskii text'
    );
  });
});

describe('hosting badge', () => {
  it('states only the deployed commit date or a missing commit', async () => {
    const { hostBadge } = await import('./host-badge.ts');
    const at = '2026-11-10T07:16:00Z';
    assert.deepEqual(hostBadge({ commit: 'abc', commitAt: at }), {
      kind: 'build',
      at,
    });
    assert.deepEqual(hostBadge({ commit: null, commitAt: null }), {
      kind: 'unknown',
    });
    // A reported commit without a known date makes no claim.
    assert.equal(hostBadge({ commit: 'abc', commitAt: null }), null);
  });

  it('never renders a commits-behind count, which goes stale between deploys', () => {
    const hosting = readFileSync(
      new URL('../components/hosting.tsx', import.meta.url),
      'utf8'
    );
    assert.ok(!hosting.includes('behindBy'), 'hosting.tsx reads behindBy');
    for (const messages of [en, vi])
      assert.ok(!('behind' in messages.hosting), 'stale "behind" copy');
  });
});
