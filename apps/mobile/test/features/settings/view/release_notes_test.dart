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
}
