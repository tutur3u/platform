import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  desktopBuildVersion,
  desktopReleaseTag,
  desktopTagVersion,
  listDesktopReleases,
  nextDesktopVersion,
} from './release-version.mjs';

const pubspec = 'name: mobile\nversion: 0.26.0+101\n';

test('legacy run-suffixed tags consume their version; new tags have no run ID', () => {
  assert.equal(desktopTagVersion('desktop-v0.26.0-40636705173'), '0.26.0');
  assert.equal(desktopTagVersion('desktop-v0.26.3'), '0.26.3');
  for (const tag of ['mobile-v0.26.0', 'desktop-v0.26', 'desktop-v0.26.0-rc1'])
    assert.equal(desktopTagVersion(tag), null);
  assert.equal(desktopReleaseTag('0.26.1'), 'desktop-v0.26.1');
  assert.throws(() => desktopReleaseTag('0.26.1-123'));
});

test('desktop patches follow the same next-unused rule as mobile builds', () => {
  assert.equal(nextDesktopVersion(pubspec, []), '0.26.0');
  assert.equal(
    nextDesktopVersion(pubspec, [
      'desktop-v0.26.0-40636705173',
      'desktop-v0.26.0-40522861860',
    ]),
    '0.26.1'
  );
  assert.equal(
    nextDesktopVersion(pubspec, ['desktop-v0.26.2', 'desktop-v0.26.0-1']),
    '0.26.3'
  );
  // A Release Please minor restarts at the pubspec patch.
  assert.equal(
    nextDesktopVersion('version: 0.27.0+102\n', ['desktop-v0.26.9']),
    '0.27.0'
  );
});

test('build version uses the derived release version or falls back to pubspec', () => {
  assert.equal(desktopBuildVersion(pubspec, '0.26.4'), '0.26.4');
  assert.equal(desktopBuildVersion(pubspec, undefined), '0.26.0');
  assert.throws(() => desktopBuildVersion(pubspec, '0.26.4-9'));
  assert.throws(() => desktopBuildVersion('version: 1.0\n', ''));
});

test('release listing keeps desktop tags with source and draft state', () => {
  const calls = [];
  const releases = listDesktopReleases((command, args) => {
    calls.push([command, ...args]);
    return `desktop-v0.26.1\t${'a'.repeat(40)}\ttrue\ndesktop-v0.26.0-9\t${'b'.repeat(40)}\tfalse\ndesktop-vbad\tx\tfalse\n`;
  });
  assert.equal(calls[0][0], 'gh');
  assert.ok(calls[0].includes('--paginate'));
  assert.deepEqual(releases, [
    { tag: 'desktop-v0.26.1', source: 'a'.repeat(40), draft: true },
    { tag: 'desktop-v0.26.0-9', source: 'b'.repeat(40), draft: false },
  ]);
});

test('a leftover failed draft reserves its version for the next queued run', () => {
  const releases = listDesktopReleases(
    () =>
      `desktop-v0.26.1\t${'a'.repeat(40)}\ttrue\ndesktop-v0.26.0-9\t${'b'.repeat(40)}\tfalse\n`
  );
  assert.equal(
    nextDesktopVersion(
      pubspec,
      releases.map(({ tag }) => tag)
    ),
    '0.26.2'
  );
});
