import 'dart:typed_data';

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/offline_preparer_registry.dart';
import 'package:mobile/core/feature_flags/mobile_flags.dart';
import 'package:mobile/features/mastermind/cubit/mastermind_snapshot_cubit.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/parse/snapshot_parser.dart';
import 'package:mobile/features/mastermind/runtime/mastermind_offline_preparation.dart';
import 'package:mobile/features/mastermind/view/mastermind_home_page.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';

import '../../../helpers/helpers.dart';
import '../../../helpers/mastermind_home_fixture.dart';
import '../../../helpers/mastermind_view_harness.dart';

void main() {
  late MastermindViewHarness h;
  late MobileFlagsState flags;
  late OfflinePreparerRegistry registry;
  setUp(() async {
    h = MastermindViewHarness();
    await h.setAccess(TestAccess.enabled);
    flags = MobileFlagsState();
    registry = OfflinePreparerRegistry(
      isEnabled: (flag) => flags.enabled(flag),
    );
    addTearDown(h.dispose);
  });

  void register({required bool enabled}) {
    flags = MobileFlagsState({
      MobileFlag.mobileOffline: true,
      MobileFlag.offlineReadMastermind: enabled,
    });
    h.runtime.registerOfflinePreparation(registry, flags);
  }

  test(
    'off has no registration, fetch or store write; disabling removes it',
    () async {
      register(enabled: false);
      expect(registry.appKeys, isEmpty);
      expect(h.source.calls, 0);
      expect(await h.store.read(), isNull);
      register(enabled: true);
      register(enabled: false);
      expect(registry.appKeys, isEmpty);
    },
  );

  test('on downloads into the existing store and reopens offline', () async {
    register(enabled: true);
    await registry['mastermind']!(rootWorkspaceId);
    final saved = await h.store.read();
    expect(saved, isNotNull);
    h.source.fetcher = () async =>
        const SnapshotFetch.unavailable(SnapshotUnavailableKind.unavailable);
    final reopened = MastermindSnapshotCubit(
      source: h.source,
      store: h.store,
      parser: (bytes) async => parseMastermindSnapshot(bytes),
    );
    addTearDown(reopened.close);
    await reopened.ensureLoaded();
    final ready = reopened.state as MastermindSnapshotReady;
    expect(ready.origin, SnapshotOrigin.cache);
    expect(ready.receivedAt, saved!.receivedAt);
    expect(ready.digest, saved.digest);
  });

  testWidgets('cold offline Home renders prepared data and sync time', (
    tester,
  ) async {
    h.source.bytes = snapshotBytes(homeJson());
    register(enabled: true);
    await tester.runAsync(() => registry['mastermind']!(rootWorkspaceId));
    h.source.fetcher = () async =>
        const SnapshotFetch.unavailable(SnapshotUnavailableKind.unavailable);
    final cold = MastermindSnapshotCubit(
      source: h.source,
      store: h.store,
      clock: () => testNow,
      parser: (bytes) async => parseMastermindSnapshot(bytes),
    );
    addTearDown(cold.close);
    expect(cold.state, isA<MastermindSnapshotInitial>());
    await tester.runAsync(cold.ensureLoaded);
    final ready = cold.state as MastermindSnapshotReady;
    expect(ready.origin, SnapshotOrigin.cache);
    expect(ready.refreshFailure, isNotNull);
    final mobileFlags = MobileFlags(networkEvents: const Stream.empty())
      ..debugOverride = {
        MobileFlag.mobileOffline: true,
        MobileFlag.offlineReadMastermind: true,
      };
    addTearDown(mobileFlags.close);
    await tester.pumpApp(
      BlocProvider.value(
        value: mobileFlags,
        child: h.wrap(
          BlocProvider.value(value: cold, child: const MastermindHomePage()),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('Last synced:'), findsOneWidget);
    expect(find.text('First decision'), findsOneWidget);
    expect(find.text('Second decision'), findsOneWidget);
    expect(cold.state, isA<MastermindSnapshotReady>());
    expect(tester.takeException(), isNull);
  });

  test(
    'invalid download and unparseable stored snapshot cannot be prepared',
    () async {
      register(enabled: true);
      h.source.bytes = Uint8List.fromList([123, 125]);
      await expectLater(
        registry['mastermind']!(rootWorkspaceId),
        throwsStateError,
      );
      expect(await h.store.read(), isNull);
      await h.store.write(h.source.bytes, testNow, digest: testDigest);
      await expectLater(h.snapshot.verifyOffline(), throwsStateError);
    },
  );

  test(
    'logout and workspace switch clear stored data and deny preparation',
    () async {
      register(enabled: true);
      await registry['mastermind']!(rootWorkspaceId);
      await h.runtime.reset();
      expect(await h.store.read(), isNull);
      expect(h.snapshot.state, isA<MastermindSnapshotInitial>());
      await h.runtime.reset(wsId: 'other-workspace');
      await expectLater(
        registry['mastermind']!('other-workspace'),
        throwsA(anything),
      );
      expect(await h.store.read(), isNull);
    },
  );
}
