import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/settings/view/release_notes.dart';

void main() {
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
