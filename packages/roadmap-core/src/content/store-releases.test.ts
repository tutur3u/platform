/** Store release shaping: screenshot captions, device and language, next release. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import en from '../../messages/en.json' with { type: 'json' };
import vi from '../../messages/vi.json' with { type: 'json' };
import {
  nextRelease,
  releaseSteps,
  STORE_TABS,
  type StoreMetadata,
  storeSelection,
  storeShots,
  withStoreSelection,
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

describe('store releases: dialog links', () => {
  const ids = ['ios', 'macos', 'android', 'windows'];

  it('opens the named store on the named tab, Overview by default', () => {
    assert.deepEqual(
      storeSelection({ store: 'ios', tab: 'screenshots' }, ids),
      {
        store: 'ios',
        tab: 'screenshots',
      }
    );
    assert.deepEqual(storeSelection({ store: 'android' }, ids), {
      store: 'android',
      tab: 'overview',
    });
    assert.equal(
      storeSelection({ store: 'ios', tab: 'billing' }, ids)?.tab,
      'overview'
    );
  });

  it('broken variant: an unknown or non-string store opens nothing', () => {
    assert.equal(storeSelection({}, ids), null);
    assert.equal(storeSelection({ store: 'steam' }, ids), null);
    assert.equal(storeSelection({ store: 1 }, ids), null);
    assert.equal(storeSelection({ tab: 'overview' }, ids), null);
  });

  it('sets and clears only its own params, keeping the others', () => {
    const search = { view: 'week', period: '2026-W47', tab: 'x' };
    assert.deepEqual(
      withStoreSelection(search, { store: 'ios', tab: 'listing' }),
      { view: 'week', period: '2026-W47', store: 'ios', tab: 'listing' }
    );
    assert.deepEqual(withStoreSelection({ ...search, store: 'ios' }, null), {
      view: 'week',
      period: '2026-W47',
    });
  });

  it('names every tab in both languages', () => {
    for (const t of [en, vi])
      for (const tab of STORE_TABS)
        assert.ok(t.storeReleases.tabs[tab], `${tab} has a label`);
  });

  it('keeps the English and Vietnamese store strings in step', () => {
    const shape = (value: unknown): unknown =>
      value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, child]) => [key, shape(child)])
          )
        : typeof value;
    assert.deepEqual(shape(vi.storeReleases), shape(en.storeReleases));
  });
});

describe('store releases: release steps', () => {
  const release = (overrides: Partial<StoreMetadata['release']>) => ({
    ...metadata.release,
    targetSubmitDate: '2026-11-27T23:59:00+07:00',
    ...overrides,
  });

  it('starts at submission with both targets shown as plans', () => {
    const steps = releaseSteps(release({}));
    assert.deepEqual(
      steps.map((step) => [step.id, step.state, step.planned]),
      [
        ['submission', 'current', true],
        ['review', 'upcoming', false],
        ['release', 'upcoming', true],
      ]
    );
    assert.equal(steps[0]?.at, '2026-11-27T23:59:00+07:00');
    assert.equal(steps[1]?.at, null);
  });

  it('moves on with each fact, and a fact replaces its target', () => {
    const steps = releaseSteps(
      release({ status: 'in_review', submittedAt: '2026-11-26T10:00:00+07:00' })
    );
    assert.deepEqual(
      steps.map((step) => step.state),
      ['done', 'current', 'upcoming']
    );
    assert.equal(steps[0]?.at, '2026-11-26T10:00:00+07:00');
    assert.equal(steps[0]?.planned, false);
  });

  it('is all done once live, even when only the release date is recorded', () => {
    const steps = releaseSteps(
      release({ status: 'live', liveAt: '2026-12-10T09:00:00+07:00' })
    );
    assert.deepEqual(
      steps.map((step) => step.state),
      ['done', 'done', 'done']
    );
    // A target on a step that is done is not shown as a plan.
    assert.equal(steps[0]?.at, null);
    assert.equal(steps[2]?.at, '2026-12-10T09:00:00+07:00');
  });

  it('broken variant: a rejection blocks review instead of passing it', () => {
    const steps = releaseSteps(
      release({ status: 'rejected', submittedAt: '2026-11-26T10:00:00+07:00' })
    );
    assert.equal(steps[1]?.state, 'blocked');
    assert.equal(steps[2]?.state, 'upcoming');
  });
});
