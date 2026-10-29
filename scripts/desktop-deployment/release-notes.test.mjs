import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  changesSince,
  classifyChanges,
  formatSize,
  renderDesktopReleaseNotes,
} from './release-notes.mjs';

const source = 'a'.repeat(40);
const files = [
  {
    name: 'Tuturuuu-linux-x64.deb',
    sha256: '1'.repeat(64),
    size: 55452450,
    verification: 'deb-package-verified',
  },
  {
    name: 'Tuturuuu-windows-x64-setup.exe',
    sha256: '2'.repeat(64),
    size: 27950135,
    verification: 'unsigned-windows',
  },
  {
    name: 'Tuturuuu-macos-universal.dmg',
    sha256: '3'.repeat(64),
    size: 90634226,
    verification: 'developer-id-notarized-stapled',
  },
];

test('sizes use the download page unit and rounding', () => {
  assert.equal(formatSize(27950135), '27 MB');
  assert.equal(formatSize(1), '1 MB');
});

test('changes split into highlights and fixes without bookkeeping', () => {
  assert.deepEqual(
    classifyChanges([
      'feat(mobile): add offline drafts (#1)',
      'fix(mobile): keep the sprint row (#2)',
      'perf(mobile): faster task list',
      'chore(release): release main',
      'test(mobile): cover drafts',
      '',
    ]),
    {
      highlights: ['Add offline drafts'],
      fixes: ['Keep the sprint row', 'Faster task list'],
    }
  );
});

test('history is optional and never fails publication', () => {
  assert.equal(changesSince(undefined, source), null);
  assert.equal(
    changesSince('b'.repeat(40), source, () => {
      throw new Error('unknown revision');
    }),
    null
  );
  const calls = [];
  const changes = changesSince('b'.repeat(40), source, (_command, args) => {
    calls.push(args);
    return 'feat(mobile): add drafts\n';
  });
  assert.deepEqual(changes, { highlights: ['Add drafts'], fixes: [] });
  assert.ok(calls[0].includes('--cherry-pick'));
  assert.ok(calls[0].includes(`${'b'.repeat(40)}...${source}`));
  assert.deepEqual(calls[0].slice(-2), ['--', 'apps/mobile']);
});

test('notes render every section, a per-platform download table and build metadata', () => {
  const notes = renderDesktopReleaseNotes({
    version: '0.26.1',
    source,
    run: '40636705173',
    files,
    changes: { highlights: ['Add drafts'], fixes: [] },
    previous: {
      tag: 'desktop-v0.26.0-40522861860',
      source: 'b'.repeat(40),
      legacy: true,
    },
  });
  assert.match(notes, /desktop beta for Windows, macOS, and Linux\./);
  assert.match(notes, /## Highlights\n\n- Add drafts\n/);
  assert.match(notes, /## Fixes\n\n- No fixes in this build\.\n/);
  assert.match(notes, /Windows packages are UNSIGNED/);
  assert.match(notes, /More info, then Run anyway/);
  assert.match(notes, /can't see it in the in-app updater/);
  const rows = notes.match(/^\| (Windows|macOS|Linux) \|.*$/gm);
  assert.deepEqual(
    rows.map((row) => row.split(' | ')[0].slice(2)),
    ['Windows', 'macOS', 'Linux']
  );
  assert.match(
    notes,
    /\| Windows \| \[Tuturuuu-windows-x64-setup\.exe\]\(https:\/\/github\.com\/tutur3u\/platform\/releases\/download\/desktop-v0\.26\.1\/Tuturuuu-windows-x64-setup\.exe\) \| 27 MB \| `2{64}` \|/
  );
  assert.match(notes, /Get-FileHash \.\\Tuturuuu-windows-x64-setup\.exe/);
  assert.match(notes, /--source-digest a{40}/);
  assert.match(notes, /\| Workflow run \| \[40636705173\]/);
  assert.match(notes, /<!-- tuturuuu-desktop-release \{.*"run":"40636705173"/);
  // The run ID is metadata only: the tag in every link has no run suffix.
  assert.doesNotMatch(notes, /download\/desktop-v0\.26\.1-/);
});

test('signed builds and unknown history get honest wording', () => {
  const notes = renderDesktopReleaseNotes({
    version: '0.26.2',
    source,
    run: '1',
    files: [{ ...files[1], verification: 'authenticode-timestamped' }],
    changes: null,
    previous: { tag: 'desktop-v0.26.1', source: 'b'.repeat(40), legacy: false },
  });
  assert.match(notes, /desktop beta for Windows\./);
  assert.match(notes, /timestamped Authenticode signatures/);
  assert.doesNotMatch(notes, /UNSIGNED/);
  assert.doesNotMatch(notes, /in-app updater/);
  assert.match(notes, /listed in the build details below/);
  assert.throws(() =>
    renderDesktopReleaseNotes({
      version: '0.26.2',
      source,
      run: '1',
      files: [{ ...files[0], name: 'other.zip' }],
      changes: null,
    })
  );
});

test('history rejects option-like and non-SHA revisions before invoking git', () => {
  for (const revision of [
    '--output=owned',
    '-n1',
    'production',
    'a'.repeat(39),
    `${'a'.repeat(40)}\n`,
  ]) {
    const never = () => assert.fail('unsafe revision reached git');
    assert.equal(changesSince(revision, source, never), null);
    assert.equal(changesSince(source, revision, never), null);
  }
  changesSince('b'.repeat(40), source, (_command, args) => {
    assert.equal(
      args[args.indexOf('--end-of-options') + 1],
      `${'b'.repeat(40)}...${source}`
    );
    return '';
  });
});
