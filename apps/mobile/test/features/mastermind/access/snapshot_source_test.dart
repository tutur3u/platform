import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/data/fixture_snapshot_source.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/data/snapshot_source_factory.dart';
import 'package:mobile/features/mastermind/data/unconfigured_snapshot_source.dart';

import '../../../helpers/mastermind_snapshot_builder.dart';

class _Bundle extends CachingAssetBundle {
  int calls = 0;
  @override
  Future<ByteData> load(String key) async {
    calls++;
    return ByteData.sublistView(MastermindSnapshotBuilder.defaults().bytes());
  }
}

void main() {
  test('unconfigured source cannot fetch bytes', () async {
    const source = UnconfiguredSnapshotSource();
    expect(source.isConfigured, isFalse);
    expect(await source.fetchSnapshot(), isA<SnapshotFetchUnavailable>());
  });
  test(
    'fixture requires native development flavor and explicit opt-in',
    () async {
      final bundle = _Bundle();
      final source = FixtureSnapshotSource(bundle: bundle);
      const enabled =
          appFlavor == 'development' &&
          bool.fromEnvironment('MASTERMIND_FIXTURE');
      expect(source.isConfigured, enabled);
      if (!enabled) {
        expect(await source.fetchSnapshot(), isA<SnapshotFetchUnavailable>());
        expect(bundle.calls, 0);
        expect(
          createMastermindSnapshotSource(),
          isA<UnconfiguredSnapshotSource>(),
        );
      } else {
        expect(await source.fetchSnapshot(), isA<SnapshotFetchOk>());
        expect(bundle.calls, 1);
        expect(createMastermindSnapshotSource(), isA<FixtureSnapshotSource>());
      }
    },
  );
}
