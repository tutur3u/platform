import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/settings/view/release_note_policy.dart';
import 'package:mobile/features/settings/view/release_notes.dart';

void main() {
  test(
    'shared bookkeeping fixtures retain legitimate product merge subjects',
    () {
      final fixtures =
          jsonDecode(
                File(
                  '../../scripts/ci/release-note-policy.fixture.json',
                ).readAsStringSync(),
              )
              as List;
      for (final item in fixtures.cast<Map<String, dynamic>>()) {
        expect(
          ReleaseNotePolicy.isBookkeeping(item['subject'] as String),
          item['bookkeeping'],
          reason: item['subject'] as String,
        );
      }
    },
  );

  test('bundled history hides bookkeeping and retains release identities', () {
    const markdown =
        "## [0.22.0](https://example.test) (2026-10-02)\n* Merge remote-tracking branch 'origin/main'\n* merge duplicate contacts";
    final notes = MobileReleaseNotes.combine(
      markdown,
      jsonEncode({
        'releases': [
          {
            'version': '0.22.0',
            'date': '2026-10-02',
            'changes': [
              "Merge remote-tracking branch 'origin/release-please--branches--production'",
              'improve settings',
            ],
          },
        ],
      }),
    );
    expect(notes.single.version, '0.22.0');
    expect(notes.single.date, DateTime(2026, 10, 2));
    expect(notes.single.changes, [
      'merge duplicate contacts',
      'improve settings',
    ]);
  });

  test(
    'groups published versions and strips developer links from summaries',
    () {
      const changelog = '''
# Changelog
## [0.11.0](https://example.com/compare) (2026-09-23)
### Features
* **mobile:** improve Mail ([#5424](https://example.com/pr)) ([abcdef0](https://example.com/commit))
* **mobile:** improve Mail ([#5424](https://example.com/pr))
## [0.10.1](https://example.com/compare) (2026-09-20)
### Bug Fixes
* **auth:** restore sessions ([123abcd](https://example.com/commit))
''';

      final releases = MobileReleaseNotes.parse(changelog);

      expect(releases, hasLength(2));
      expect(releases.first.version, '0.11.0');
      expect(releases.first.changes, ['improve Mail']);
      expect(releases.last.changes, ['restore sessions']);
    },
  );

  for (final followUp in [
    <String>[],
    ['follow-up'],
    ['new feature', 'follow-up', 'follow-up'],
  ]) {
    test(
      'same-version beta notes retain published baseline with $followUp',
      () {
        const changelog = '''
## [0.21.0](https://example.com/compare) (2026-09-30)
* **mobile:** new feature
* **mobile:** baseline fix
''';
        final history = jsonEncode({
          'releases': [
            {'version': '0.21.0', 'date': '2026-10-01', 'changes': followUp},
          ],
        });
        final releases = MobileReleaseNotes.combine(changelog, history);
        expect(releases, hasLength(1));
        expect(releases.single.version, '0.21.0');
        expect(releases.single.changes, [
          'new feature',
          'baseline fix',
          if (followUp.contains('follow-up')) 'follow-up',
        ]);
        expect(releases.single.date, DateTime(2026, 9, 30));
      },
    );
  }

  test('shows bundled beta patches above the published changelog', () {
    const changelog = '''
## [0.11.0](https://example.com/compare) (2026-09-23)
* **mobile:** baseline release
''';
    const patchHistory = '''
{"releases":[{"version":"0.11.4","date":"2026-09-24","changes":["Restore sessions","Improve settings"]},{"version":"0.11.1","date":"2026-09-23","changes":["Improve Mail"]}]}
''';

    final releases = MobileReleaseNotes.combine(changelog, patchHistory);

    expect(releases.map((release) => release.version), [
      '0.11.4',
      '0.11.1',
      '0.11.0',
    ]);
    expect(releases.first.changes, ['Restore sessions', 'Improve settings']);
  });
}
