/** D79: the shipping pulse copy and the Upskii links. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import en from '../../messages/en.json' with { type: 'json' };
import vi from '../../messages/vi.json' with { type: 'json' };

/** Every EduFest workshop component module (components/workshop/*), joined. */
function workshopSource(file?: string) {
  const dir = new URL('../components/workshop/', import.meta.url);
  const files = file
    ? [file]
    : readdirSync(dir)
        .filter((name) => /\.tsx?$/.test(name))
        .sort();
  return files
    .map((name) => readFileSync(new URL(name, dir), 'utf8'))
    .join('\n');
}

describe('shipping pulse copy', () => {
  it('has EN/VI copy for the pulse, the catch-up sections and the glance', () => {
    for (const messages of [en, vi]) {
      assert.ok(
        messages.pulse.title && messages.pulse.all && messages.pulse.tracked
      );
      assert.ok(messages.pulse.table && messages.pulse.chart);
      assert.ok(messages.updates.title && messages.updates.sinceLastVisit);
      assert.ok(messages.notes.title);
      assert.ok(messages.glance.title && messages.glance.shipped);
    }
  });

  it('broken variant: no "Show the numbers" disclosure remains', () => {
    for (const messages of [en, vi])
      assert.ok(!('source' in messages.pulse), 'old pulse copy');
    const page = readFileSync(
      new URL('../components/pulse.tsx', import.meta.url),
      'utf8'
    );
    assert.ok(!page.includes('pulse-table'), 'old disclosure markup');
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
    const source = workshopSource();
    assert.ok(
      source.includes("from '../../assets/upskii-logo-96.png?no-inline'")
    );
    assert.ok(!source.includes("upskii-official-logo.png?no-inline'"));
  });

  it('every rendered Upskii mention goes through a linking helper', () => {
    const source = workshopSource();
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
