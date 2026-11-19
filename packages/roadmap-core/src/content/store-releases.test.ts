/** Store release shaping: screenshot captions, device and language, next release. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  nextRelease,
  type StoreMetadata,
  storeShots,
} from './store-releases.ts';

const alt = (text: string) => ({ en: text, vi: `${text} vi` });
const metadata: StoreMetadata = {
  platform: 'iOS',
  release: {
    status: 'preparing',
    version: '1.0.0',
    build: '1',
    targetSubmitDate: null,
    targetLiveDate: '2026-12-10T23:59:00+07:00',
    submittedAt: null,
    approvedAt: null,
    liveAt: null,
  },
  gallery: [
    {
      file: 'shots/web/01-dashboard.webp',
      width: 600,
      height: 1200,
      alt: alt('Home'),
    },
    {
      file: 'shots/web/02-tasks.webp',
      width: 600,
      height: 1200,
      alt: alt('Board'),
    },
    {
      file: 'shots/web/03-missing.webp',
      width: 600,
      height: 1200,
      alt: alt('Gone'),
    },
  ],
  screenshots: {
    'iphone-6.9': [
      { id: 'dashboard', caption: { en: 'Your day', vi: 'Ngày của bạn' } },
    ],
  },
};

describe('store releases: screenshots', () => {
  const urls = {
    'shots/web/01-dashboard.webp': '/a.webp',
    'shots/web/02-tasks.webp': '/b.webp',
  };

  it('names the device and language of the capture and skips images with no URL', () => {
    const { device, locale, shots } = storeShots(
      metadata,
      { source: 'ios/iphone-6.9/en' },
      urls
    );
    assert.equal(device, 'iphone-6.9');
    assert.equal(locale, 'en');
    assert.deepEqual(
      shots.map((shot) => [shot.id, shot.url]),
      [
        ['dashboard', '/a.webp'],
        ['tasks', '/b.webp'],
      ]
    );
    // Broken variant: reading the device from the wrong segment loses it.
    assert.notEqual('ios/iphone-6.9/en'.split('/')[0], device);
  });

  it('uses the store caption when there is one and the alt text otherwise', () => {
    const { shots } = storeShots(
      metadata,
      { source: 'ios/iphone-6.9/vi' },
      urls
    );
    assert.equal(shots[0]?.caption.vi, 'Ngày của bạn');
    assert.equal(shots[1]?.caption.en, 'Board');
  });

  it('reads Vietnamese captures as Vietnamese and anything else as English', () => {
    assert.equal(
      storeShots(metadata, { source: 'ios/iphone-6.9/vi' }, urls).locale,
      'vi'
    );
    assert.equal(
      storeShots(metadata, { source: 'ios/iphone-6.9/fr' }, urls).locale,
      'en'
    );
  });
});

describe('store releases: next release', () => {
  const store = (liveAt: string | null, target: string | null) => ({
    release: { ...metadata.release, liveAt, targetLiveDate: target },
  });
  const now = Date.parse('2026-11-20T00:00:00Z');

  it('is the earliest future target that is not live yet', () => {
    const late = store(null, '2026-12-10T00:00:00Z');
    const soon = store(null, '2026-12-01T00:00:00Z');
    assert.equal(nextRelease([late, soon], now)?.store, soon);
  });

  it('skips released, past and unscheduled stores, and is null with none left', () => {
    assert.equal(
      nextRelease([store('2026-11-01T00:00:00Z', '2026-12-01T00:00:00Z')], now),
      null
    );
    assert.equal(nextRelease([store(null, '2026-11-01T00:00:00Z')], now), null);
    assert.equal(nextRelease([store(null, null)], now), null);
    assert.equal(nextRelease([], now), null);
  });
});
