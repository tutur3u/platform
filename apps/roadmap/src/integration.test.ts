import { readStyles } from './style-source.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseChangelog } from './changelog/schema.ts';
import { comingSoon } from './content/coming-soon.ts';
import { localDay } from './live/feed.ts';
const source = (file: string) =>
  readFileSync(new URL(file, import.meta.url), 'utf8');

test('real parser accepts fallback, rejects markup and malformed releases', () => {
  const fixture = JSON.parse(source('./changelog/fixtures/changelog.json'));
  assert.equal(parseChangelog(fixture)?.mode, 'fallback');
  assert.equal(parseChangelog({ ...fixture, schema: 2 }), null);
  fixture.releases[0].summary.en = '<b>bad</b>';
  assert.equal(parseChangelog(fixture), null);
  const notes = source('./components/insights/patch-notes.tsx');
  const guard = (s: string) =>
    /if \(!changelog\?\.releases\.length\) return null/.test(s) &&
    s.includes('t.notes.fallback') &&
    s.includes('model: changelog.model');
  assert.ok(guard(notes));
  assert.ok(!guard(notes.replace('t.notes.fallback', "''")));
  assert.ok(
    !guard(notes.replace('if (!changelog?.releases.length) return null;', ''))
  );
});
test('catch-up single column follows release count, including an empty parsed object', () => {
  const page = source('./pages/roadmap.tsx');
  const guard = (s: string) =>
    s.includes("changelog?.releases.length ? '' : ' catchup-single'");
  assert.ok(guard(page));
  assert.ok(
    !guard(page.replace('changelog?.releases.length ?', 'changelog ?'))
  );
});
test('release dates use the Vietnam local day at UTC midnight boundary', () => {
  const iso = '2026-11-12T18:00:00Z';
  assert.equal(localDay(iso), '2026-11-13');
  assert.notEqual(iso.slice(0, 10), localDay(iso));
  const notes = source('./components/insights/patch-notes.tsx');
  assert.ok(notes.includes('shortDay(localDay(release.date), lang)'));
  assert.ok(
    !notes
      .replace('localDay(release.date)', 'release.date.slice(0, 10)')
      .includes('shortDay(localDay(release.date), lang)')
  );
});
test('Mira announcement localizes title and body without changing prices', () => {
  const item = comingSoon[0];
  for (const key of ['title', 'body'] as const)
    assert.notEqual(item[key].en, item[key].vi);
  assert.doesNotMatch(item.body.vi, /subscription plans|\/month/);
  assert.match(item.body.vi, /\$100 và \$200\/tháng/);
  assert.match(item.body.en, /\$100 and \$200\/month/);
  const hero = source('./components/hero.tsx');
  assert.ok(hero.includes('item.body[lang]'));
  assert.ok(
    !hero.replace('item.body[lang]', 'item.body.en').includes('item.body[lang]')
  );
});
test('EduFest actions reserve at least 24px height', () => {
  const css = readStyles();
  const guard = (s: string) =>
    /\.ws-event-links a \{[^}]*min-height: (\d+)px/.exec(s)?.[1];
  assert.ok(Number(guard(css)) >= 24);
  assert.ok(
    !(
      Number(guard(css.replace('min-height: 24px;', 'min-height: 23px;'))) >= 24
    )
  );
});

test('split CSS keeps the UI scan exclusion at the repository components directory', () => {
  const path = new URL('./styles/section-1.css', import.meta.url);
  const css = readFileSync(path, 'utf8');
  const expected = new URL(
    '../../../packages/ui/src/components',
    import.meta.url
  ).pathname;
  const matches = (text: string) => {
    const target = /@source not '([^']*packages\/ui\/src\/components)'/.exec(
      text
    )?.[1];
    return target && new URL(target, path).pathname === expected;
  };
  assert.ok(matches(css));
  assert.ok(
    !matches(css.replace('../../../../packages/ui', '../../../packages/ui'))
  );
});
