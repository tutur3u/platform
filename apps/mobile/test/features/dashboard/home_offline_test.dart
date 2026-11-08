import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_preparer_registry.dart';
import 'package:mobile/core/feature_flags/mobile_flags.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mobile/features/classes/data/classes_today_repository.dart';
import 'package:mobile/features/dashboard/home_offline_preparation.dart';
import 'package:mobile/features/dashboard/view/home_offline_frame.dart';
import 'package:mobile/features/tasks/cubit/task_list_cubit.dart';

import '../../helpers/helpers.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('flags gate scoped preparation and snapshot size', () async {
    final dir = await Directory.systemTemp.createTemp('home-offline-');
    FlutterSecureStorage.setMockInitialValues({});
    final store = CacheStore.forTesting(
      secureStorage: const FlutterSecureStorage(),
      directoryResolver: () async => dir,
    );
    await store.init();
    addTearDown(() async {
      await store.closeForTesting();
      await dir.delete(recursive: true);
    });
    var flags = MobileFlagsState();
    final registry = OfflinePreparerRegistry(
      isEnabled: (flag) => flags.enabled(flag),
    );
    var calls = 0;
    const keys = [
      CacheKey(namespace: 'one', userId: 'u', workspaceId: 'w'),
      CacheKey(namespace: 'two', userId: 'u', workspaceId: 'w'),
    ];
    Future<void> prepare(String ws) => retainHomeOffline(
      ws,
      store: store,
      owner: () => 'u',
      warm: () async {
        calls++;
        for (final key in keys) {
          await store.write(
            key: key,
            policy: CachePolicies.summary,
            payload: key.namespace,
          );
        }
        return keys;
      },
    );
    registerHomeOffline(registry, flags, prepare);
    expect(registry.appKeys, isEmpty);
    expect(calls, 0);
    flags = MobileFlagsState({
      MobileFlag.mobileOffline: true,
      MobileFlag.offlineReadHome: true,
    });
    registerHomeOffline(registry, flags, prepare);
    await registry['home']!('w');
    expect(calls, 1);
    for (final key in keys) {
      final got = await store.read<Object?>(key: key, decode: (json) => json);
      expect(got.data, key.namespace);
    }
    Future<void> retain(String ws) => retainHomeOffline(
      ws,
      store: store,
      owner: () => 'u',
      warm: () async => keys,
    );
    await expectLater(retain('other'), throwsStateError);
    await store.write(
      key: keys.first,
      policy: CachePolicies.summary,
      payload: 'x' * (4 * 1024 * 1024 + 1),
    );
    await expectLater(retain('w'), throwsStateError);
    flags = MobileFlagsState();
    registerHomeOffline(registry, flags, prepare);
    expect(registry.appKeys, isEmpty);
  });
  test('warmed keys reopen through screen readers', () async {
    FlutterSecureStorage.setMockInitialValues({});
    final cache = CacheStore.instance;
    await cache.init();
    addTearDown(cache.closeForTesting);
    Future<void> warm(CacheKey key, Object payload) => cache.write(
      key: key,
      policy: CachePolicies.offlineCatalog,
      payload: payload,
    );
    await warm(TaskListCubit.offlineSummaryKey('w', isPersonal: false), {
      'totalActiveTasks': 17,
    });
    await warm(CalendarCubit.offlineSummaryKey('w'), {
      'selectedDate': '2026-11-02',
    });
    final day = DateTime(2026, 11, 2);
    await warm(
      SessionsClassesTodayRepository.offlineSummaryKey('u', 'w', day),
      {'sessions': <Object?>[], 'scopeSupported': true},
    );
    final tasks = TaskListCubit.seedStateFor(wsId: 'w', isPersonal: false);
    expect(tasks?.totalActiveTasks, 17);
    expect(CalendarCubit.seedStateForWorkspace('w')?.selectedDate, day);
    final classes = SessionsClassesTodayRepository(store: cache);
    final saved = classes.peek(userId: 'u', wsId: 'w', day: day);
    expect(saved?.scopeSupported, isTrue);
  });
  for (final enabled in [false, true]) {
    testWidgets(
      'offline placeholder flag=$enabled; on reconnect card returns',
      (tester) async {
        final flags = MobileFlags(networkEvents: const Stream.empty())
          ..debugOverride = {
            MobileFlag.mobileOffline: true,
            MobileFlag.offlineReadHome: enabled,
          };
        addTearDown(flags.close);
        Widget frame(ConnectivityResult connection) => BlocProvider.value(
          value: flags,
          child: HomeOfflineFrame(
            networkChanges: Stream.value([connection]),
            child: const HomeOnlineCard(child: Text('Mail preview')),
          ),
        );
        await tester.pumpApp(frame(ConnectivityResult.none));
        await tester.pump();
        expect(
          find.text('Not available offline'),
          enabled ? findsOneWidget : findsNothing,
        );
        expect(
          find.text('Mail preview'),
          enabled ? findsNothing : findsOneWidget,
        );
        await tester.pumpApp(frame(ConnectivityResult.wifi));
        await tester.pump();
        expect(find.text('Mail preview'), findsOneWidget);
      },
    );
  }
}
