/** Feature previews: manifest shaping, copy coverage and image fallbacks. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import en from '../../messages/en.json' with { type: 'json' };
import vi from '../../messages/vi.json' with { type: 'json' };
import {
  buildFeatures,
  DEVICE_GROUPS,
  deviceGroups,
  FEATURE_COPY,
  hasVariants,
  type ManifestItem,
  pickImage,
} from './feature-previews.ts';

const item = (
  screen: string,
  device: string,
  theme: string,
  locale = 'en'
): ManifestItem => {
  const base = `packages/roadmap-core/src/assets/previews/app/${screen}/${device}-${theme}-${locale}`;
  return {
    screen,
    device,
    theme,
    locale,
    width: device.includes('landscape') || device === 'mac' ? 1600 : 600,
    height: device.includes('landscape') || device === 'mac' ? 1000 : 1280,
    avif: `${base}.avif`,
    webp: `${base}.webp`,
  };
};
const urlsFor = (items: ManifestItem[]) =>
  Object.fromEntries(
    items.flatMap((entry) => [
      [entry.avif, `/x/${entry.avif}`],
      [entry.webp, `/x/${entry.webp}`],
    ])
  );

describe('buildFeatures', () => {
  const items = [
    item('tasks', 'iphone', 'light'),
    item('tasks', 'iphone', 'dark'),
    item('tasks', 'iphone', 'light', 'vi'),
    item('tasks', 'ipad', 'light'),
    item('tasks', 'ipad-landscape', 'light'),
    item('tasks', 'duo-folded', 'light'),
    item('calendar', 'mac', 'dark'),
    item('not-public', 'iphone', 'light'),
    item('tasks', 'watch', 'light'),
  ];
  const features = buildFeatures({ app: { items } }, urlsFor(items));

  it('keeps only screens with public copy, in copy order', () => {
    assert.deepEqual(
      features.map((feature) => feature.id),
      ['tasks', 'calendar']
    );
  });

  it('drops unknown devices and images the build did not resolve', () => {
    const tasks = features[0];
    assert.ok(tasks);
    assert.equal(tasks.images.length, 6);
    const missing = buildFeatures({ app: { items } }, {});
    assert.deepEqual(missing, []);
  });

  it('lists device groups and variants a feature has', () => {
    const [tasks, calendar] = features;
    assert.ok(tasks && calendar);
    assert.deepEqual(deviceGroups(tasks), ['iphone', 'ipad', 'duo']);
    assert.equal(hasVariants(tasks, 'ipad'), true);
    assert.equal(hasVariants(tasks, 'duo'), false);
    assert.deepEqual(deviceGroups(calendar), ['mac']);
  });

  it('falls back to another group, theme or English, never to nothing', () => {
    const [tasks, calendar] = features;
    assert.ok(tasks && calendar);
    const pick = (
      group: 'iphone' | 'ipad' | 'mac' | 'duo',
      variant: 0 | 1,
      theme: 'light' | 'dark',
      lang: 'en' | 'vi'
    ) => pickImage(tasks, { group, variant, theme, lang });
    assert.equal(pick('iphone', 0, 'light', 'vi')?.image.locale, 'vi');
    assert.equal(pick('iphone', 0, 'dark', 'vi')?.image.locale, 'en');
    assert.equal(
      pick('ipad', 1, 'light', 'en')?.image.device,
      'ipad-landscape'
    );
    assert.equal(pick('duo', 1, 'dark', 'en')?.image.device, 'duo-folded');
    assert.equal(pick('duo', 1, 'dark', 'en')?.image.theme, 'light');
    assert.equal(pick('mac', 0, 'light', 'en')?.group, 'iphone');
    const mac = pickImage(calendar, {
      group: 'iphone',
      variant: 0,
      theme: 'light',
      lang: 'en',
    });
    assert.equal(mac?.image.device, 'mac');
    assert.equal(mac?.image.theme, 'dark');
  });

  it('shows a Vietnamese-only capture to English readers too', () => {
    const only = [item('calendar', 'iphone', 'light', 'vi')];
    const [calendar] = buildFeatures({ app: { items: only } }, urlsFor(only));
    assert.ok(calendar);
    const picked = pickImage(calendar, {
      group: 'iphone',
      variant: 0,
      theme: 'light',
      lang: 'en',
    });
    assert.equal(picked?.image.locale, 'vi');
  });
});

describe('feature preview copy', () => {
  it('has English and Vietnamese text within the alt-text budget', () => {
    for (const [key, entry] of Object.entries(FEATURE_COPY)) {
      for (const lang of ['en', 'vi'] as const) {
        assert.ok(entry.title[lang].trim(), `${key} ${lang} title`);
        assert.ok(entry.body[lang].trim(), `${key} ${lang} body`);
        assert.ok(entry.body[lang].length <= 120, `${key} ${lang} body length`);
      }
    }
  });

  it('labels every device and group in both languages', () => {
    for (const t of [en.featurePreviews, vi.featurePreviews]) {
      for (const group of Object.keys(DEVICE_GROUPS)) {
        assert.ok(t.groups[group as keyof typeof t.groups], group);
      }
      for (const device of Object.values(DEVICE_GROUPS).flat()) {
        assert.ok(t.devices[device], device);
      }
    }
  });
});

describe('committed preview manifests', () => {
  for (const source of ['app', 'web'] as const) {
    const path = new URL(
      `../assets/previews/${source}/manifest.json`,
      import.meta.url
    );
    it(`${source}: every file exists and stays within the web budget`, (t) => {
      if (!existsSync(path)) return t.skip('not captured yet');
      const { items } = JSON.parse(readFileSync(path, 'utf8')) as {
        items: (ManifestItem & { avifBytes: number; webpBytes: number })[];
      };
      assert.ok(items.length > 0);
      for (const entry of items) {
        for (const file of [entry.avif, entry.webp]) {
          assert.ok(
            file.startsWith(
              `packages/roadmap-core/src/assets/previews/${source}/`
            ),
            file
          );
          assert.ok(
            existsSync(new URL(`../../../../${file}`, import.meta.url)),
            file
          );
        }
        assert.ok(
          entry.avifBytes <= 160_000,
          `${entry.avif} ${entry.avifBytes}`
        );
        assert.ok(
          entry.webpBytes <= 200_000,
          `${entry.webp} ${entry.webpBytes}`
        );
        assert.ok(Math.max(entry.width, entry.height) <= 1600, entry.webp);
      }
    });
  }
});
