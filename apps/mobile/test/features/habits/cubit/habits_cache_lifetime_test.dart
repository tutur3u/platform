import 'dart:async';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/habit_tracker.dart';
import 'package:mobile/data/repositories/habit_tracker_repository.dart';
import 'package:mobile/features/habits/cubit/habits_cubit.dart';
import 'package:mobile/features/habits/cubit/habits_snapshot_access.dart';
import 'package:mobile/features/habits/cubit/habits_state.dart';
import 'package:mocktail/mocktail.dart';

class _Storage extends Mock implements FlutterSecureStorage {}

class _Repository extends Mock implements IHabitTrackerRepository {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory directory;
  late CacheStore store;
  late HabitsCubit cubit;
  late _Repository repository;
  late String actor;
  FutureOr<void> Function(String)? checkpoint;
  final empty = HabitTrackerListResponse.fromJson(const {
    'trackers': <dynamic>[],
  });
  CacheKey key(String ws) => CacheKey(
    namespace: 'habits.workspace',
    userId: 'owner',
    workspaceId: ws,
    locale: currentCacheLocaleTag(),
    params: const {'scope': 'self'},
  );

  setUpAll(() => registerFallbackValue(HabitTrackerScope.self));
  setUp(() async {
    HabitsCubit.clearCache();
    directory = await Directory.systemTemp.createTemp('habits-cache-lifetime-');
    final storage = _Storage();
    final secrets = <String, String>{};
    when(
      () => storage.read(key: any(named: 'key')),
    ).thenAnswer((call) async => secrets[call.namedArguments[#key] as String]);
    when(
      () => storage.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((call) async {
      secrets[call.namedArguments[#key] as String] =
          call.namedArguments[#value] as String;
    });
    when(() => storage.delete(key: any(named: 'key'))).thenAnswer((call) async {
      secrets.remove(call.namedArguments[#key]);
    });
    checkpoint = null;
    store = CacheStore.forTesting(
      secureStorage: storage,
      directoryResolver: () async => directory,
      persistenceCheckpoint: (stage) => checkpoint?.call(stage),
    );
    repository = _Repository();
    actor = 'owner';
    cubit = HabitsCubit(
      repository: repository,
      actorId: 'owner',
      currentUserId: () => actor,
      cacheStore: store,
      snapshotAccess: HabitsSnapshotAccess(store, storage: storage),
    );
  });
  tearDown(() async {
    checkpoint = null;
    await cubit.close();
    await store.closeForTesting();
    await Hive.close();
    await directory.delete(recursive: true);
  });

  test(
    'delayed snapshot cannot persist after workspace generation changes',
    () async {
      final entered = Completer<void>();
      final release = Completer<void>();
      var delayed = false;
      checkpoint = (stage) {
        if (stage == 'snapshot' && !delayed) {
          delayed = true;
          entered.complete();
          return release.future;
        }
      };
      when(
        () => repository.listTrackers(
          any(),
          scope: any(named: 'scope'),
          userId: any(named: 'userId'),
          requireFresh: any(named: 'requireFresh'),
        ),
      ).thenAnswer((_) async => empty);
      await cubit.loadWorkspace('old');
      await entered.future;
      await cubit.loadWorkspace('new');
      release.complete();
      // Drain the preceding snapshot writes through the shared queue.
      await store.write(
        key: const CacheKey(namespace: 'test.barrier', userId: 'owner'),
        policy: CachePolicies.moduleData,
        payload: const {'done': true},
      );
      expect(
        store
            .peek<Map<String, dynamic>>(
              key: key('old'),
              decode: (json) => (json! as Map).cast<String, dynamic>(),
            )
            .hasValue,
        isFalse,
      );
      expect(cubit.state.activeWorkspaceId, 'new');
      expect(cubit.state.status, HabitsStatus.loaded);
    },
  );

  test(
    'same actor signout and re-signin cannot revive a pending response',
    () async {
      final entered = Completer<void>();
      final response = Completer<HabitTrackerListResponse>();
      when(
        () => repository.listTrackers(
          'ws',
          scope: any(named: 'scope'),
          userId: any(named: 'userId'),
          requireFresh: any(named: 'requireFresh'),
        ),
      ).thenAnswer((_) {
        entered.complete();
        return response.future;
      });
      final loading = cubit.loadWorkspace('ws');
      await entered.future;
      actor = 'other';
      await store.clearResources(userId: 'owner');
      actor = 'owner';
      response.complete(empty);
      await loading;
      expect(cubit.state.listResponse, isNull);
      expect(
        store
            .peek<Map<String, dynamic>>(
              key: key('ws'),
              decode: (json) => (json! as Map).cast<String, dynamic>(),
            )
            .hasValue,
        isFalse,
      );
    },
  );
}
