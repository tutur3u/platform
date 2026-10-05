import 'dart:async';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/data/repositories/habit_tracker_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/habits/cubit/habits_cubit.dart';
import 'package:mobile/features/habits/cubit/habits_snapshot_access.dart';
import 'package:mocktail/mocktail.dart';

class _Storage extends Mock implements FlutterSecureStorage {}

class _Api extends Mock implements ApiClient {}

class _Queue extends Mock implements OfflineMutationQueue {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory directory;
  late CacheStore store;
  late _Storage storage;
  late HabitsSnapshotAccess access;
  final secrets = <String, String>{};
  FutureOr<void> Function(String)? checkpoint;
  var markerWritesFail = false;
  const denied = ApiException(message: 'Denied', statusCode: 403);
  CacheKey key({
    String actor = 'owner',
    String ws = 'ws',
    String scope = 'self',
  }) => CacheKey(
    namespace: 'habits.workspace',
    userId: actor,
    workspaceId: ws,
    params: {'scope': scope},
  );
  void guard() {}
  Future<void> publish(CacheKey key, {bool authorized = true, int? revision}) =>
      access.publish(
        key: key,
        payload: const {'value': 'private'},
        policy: CachePolicies.moduleData,
        tags: const ['module:habits'],
        expectedRevision: revision ?? access.revision(key),
        checkScope: guard,
        authorizedList: authorized,
      );
  bool exists(CacheKey key) => store
      .peek<Map<String, dynamic>>(
        key: key,
        decode: (json) => (json! as Map).cast<String, dynamic>(),
      )
      .hasValue;

  setUp(() async {
    secrets.clear();
    markerWritesFail = false;
    checkpoint = null;
    storage = _Storage();
    when(
      () => storage.read(key: any(named: 'key')),
    ).thenAnswer((call) async => secrets[call.namedArguments[#key] as String]);
    when(
      () => storage.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((call) async {
      final id = call.namedArguments[#key] as String;
      if (markerWritesFail && id.startsWith('habits-workspace-denied-v1')) {
        throw StateError('Marker unavailable');
      }
      secrets[id] = call.namedArguments[#value] as String;
    });
    when(() => storage.delete(key: any(named: 'key'))).thenAnswer((call) async {
      secrets.remove(call.namedArguments[#key]);
    });
    directory = await Directory.systemTemp.createTemp('habits-denial-');
    store = CacheStore.forTesting(
      secureStorage: storage,
      directoryResolver: () async => directory,
      persistenceCheckpoint: (stage) => checkpoint?.call(stage),
    );
    access = HabitsSnapshotAccess(store, storage: storage);
    await store.init();
  });
  tearDown(() async {
    checkpoint = null;
    await store.closeForTesting();
    await Hive.close();
    await directory.delete(recursive: true);
  });

  test(
    'denial purges all query variants but preserves other actors/workspaces',
    () async {
      await publish(key());
      await publish(key(scope: 'team'));
      await publish(key(actor: 'other'));
      await publish(key(ws: 'other-ws'));
      await access.revoke(key(), denied, guard);
      expect(exists(key()), isFalse);
      expect(exists(key(scope: 'team')), isFalse);
      expect(exists(key(actor: 'other')), isTrue);
      expect(exists(key(ws: 'other-ws')), isTrue);
      final reopened = HabitsSnapshotAccess(store, storage: storage);
      expect(await reopened.canRead(key()), isFalse);
      expect(await reopened.canRead(key(scope: 'team')), isFalse);
    },
  );

  test('anonymous denial cannot purge authenticated snapshots', () async {
    await publish(key());
    const anonymous = CacheKey(
      namespace: 'habits.workspace',
      workspaceId: 'ws',
    );
    await access.revoke(anonymous, denied, guard);
    expect(exists(key()), isTrue);
    expect(await access.canRead(key()), isTrue);
    expect(await access.canRead(anonymous), isFalse);
  });

  test(
    'durable marker blocks retained snapshot after a purge failure',
    () async {
      await publish(key());
      checkpoint = (stage) {
        if (stage == 'clear-intent') throw StateError('Disk failure');
      };
      await access.revoke(key(), denied, guard);
      final reopened = HabitsSnapshotAccess(store, storage: storage);
      expect(await reopened.canRead(key()), isFalse);
      expect(reopened.canPeek(key()), isFalse);
    },
  );

  test('ordinary local edits never authorize a denied snapshot', () async {
    await access.revoke(key(), denied, guard);
    await publish(key(), authorized: false);
    expect(await access.canRead(key()), isFalse);
    expect(exists(key()), isFalse);
    await publish(key());
    expect(await access.canRead(key()), isTrue);
    expect(exists(key()), isTrue);
  });

  test(
    'failed authorized publication cannot clear the denial marker',
    () async {
      await access.revoke(key(), denied, guard);
      checkpoint = (stage) {
        if (stage == 'snapshot') throw StateError('Disk failure');
      };
      await expectLater(publish(key()), throwsStateError);
      expect(
        await HabitsSnapshotAccess(store, storage: storage).canRead(key()),
        isFalse,
      );
    },
  );

  test('denial rejects responses that began before access changed', () async {
    final revision = access.revision(key());
    await access.revoke(key(), denied, guard);
    await expectLater(
      publish(key(), revision: revision),
      throwsA(
        isA<ApiException>().having(
          (e) => e.failureKind,
          'kind',
          ApiFailureKind.session,
        ),
      ),
    );
  });

  test(
    'new authorization waits for an admitted purge and survives it',
    () async {
      await publish(key());
      final entered = Completer<void>();
      final release = Completer<void>();
      checkpoint = (stage) {
        if (stage == 'clear-intent') {
          entered.complete();
          return release.future;
        }
      };
      final revoking = access.revoke(key(), denied, guard);
      await entered.future;
      var published = false;
      final publishing = publish(key()).then((_) => published = true);
      await Future<void>.delayed(Duration.zero);
      expect(published, isFalse);
      release.complete();
      await revoking;
      await publishing;
      expect(exists(key()), isTrue);
      expect(await access.canRead(key()), isTrue);
    },
  );

  test('both storage failures surface and leave access blocked', () async {
    await publish(key());
    markerWritesFail = true;
    checkpoint = (stage) {
      if (stage == 'clear-intent') throw StateError('Disk failure');
    };
    await expectLater(
      access.revoke(key(), denied, guard),
      throwsA(
        isA<ApiException>().having(
          (e) => e.code,
          'code',
          'HABITS_CACHE_REVOCATION_FAILED',
        ),
      ),
    );
    expect(access.canPeek(key()), isFalse);
  });

  test('unreadable marker cannot authorize a cold snapshot', () async {
    when(
      () => storage.read(key: any(named: 'key')),
    ).thenThrow(StateError('Unavailable'));
    expect(await access.canRead(key()), isFalse);
  });

  test(
    'fresh repository read never returns an older transport fallback',
    () async {
      final api = _Api();
      final queue = _Queue();
      when(
        queue.listPending,
      ).thenAnswer((_) async => <PendingMutationRecord>[]);
      const path = '/api/v1/workspaces/ws/habit-trackers?scope=self';
      const response = <String, dynamic>{
        'trackers': <dynamic>[],
        'members': <dynamic>[],
      };
      when(() => api.getJson(path)).thenAnswer((_) async => response);
      final repo = HabitTrackerRepository(
        apiClient: api,
        cacheStore: store,
        mutationQueue: queue,
        currentUserId: () => 'owner',
      );
      await repo.listTrackers('ws', requireFresh: true);
      await access.revoke(key(), denied, guard);
      final request = Completer<Map<String, dynamic>>();
      when(() => api.getJson(path)).thenAnswer((_) => request.future);
      var completed = false;
      final pending = repo
          .listTrackers('ws', requireFresh: true)
          .whenComplete(() => completed = true);
      await Future<void>.delayed(Duration.zero);
      expect(completed, isFalse);
      request.completeError(
        const ApiException(
          message: 'Offline',
          statusCode: 0,
          failureKind: ApiFailureKind.transport,
        ),
      );
      await expectLater(pending, throwsA(isA<ApiException>()));
      expect(await access.canRead(key()), isFalse);
    },
  );

  test(
    'real cubit clears retained private member rows on definitive denial',
    () async {
      final api = _Api();
      final queue = _Queue();
      when(
        queue.listPending,
      ).thenAnswer((_) async => <PendingMutationRecord>[]);
      const path = '/api/v1/workspaces/ws/habit-trackers?scope=self';
      when(() => api.getJson(path)).thenAnswer(
        (_) async => {
          'trackers': <dynamic>[],
          'members': [
            {'user_id': 'private-member', 'display_name': 'Private member'},
          ],
        },
      );
      final repo = HabitTrackerRepository(
        apiClient: api,
        cacheStore: store,
        mutationQueue: queue,
        currentUserId: () => 'owner',
      );
      final cubit = HabitsCubit(
        repository: repo,
        actorId: 'owner',
        currentUserId: () => 'owner',
        cacheStore: store,
        snapshotAccess: access,
      );
      addTearDown(cubit.close);
      await cubit.loadWorkspace('ws');
      expect(cubit.state.members.single.displayName, 'Private member');
      when(() => api.getJson(path)).thenThrow(denied);
      await cubit.loadWorkspace('ws', refresh: true);
      expect(cubit.state.listResponse, isNull);
      expect(cubit.state.members, isEmpty);
      expect(await access.canRead(key()), isFalse);
    },
  );

  test('cubit keeps denial blocked when both durable stores fail', () async {
    final api = _Api();
    final queue = _Queue();
    when(queue.listPending).thenAnswer((_) async => <PendingMutationRecord>[]);
    const path = '/api/v1/workspaces/ws/habit-trackers?scope=self';
    when(() => api.getJson(path)).thenThrow(denied);
    final cubit = HabitsCubit(
      repository: HabitTrackerRepository(
        apiClient: api,
        cacheStore: store,
        mutationQueue: queue,
        currentUserId: () => 'owner',
      ),
      actorId: 'owner',
      currentUserId: () => 'owner',
      cacheStore: store,
      snapshotAccess: access,
    );
    addTearDown(cubit.close);
    markerWritesFail = true;
    final entered = Completer<void>();
    final release = Completer<void>();
    checkpoint = (stage) async {
      if (stage == 'clear-intent') {
        entered.complete();
        await release.future;
        throw StateError('Disk unavailable');
      }
    };
    final loading = cubit.loadWorkspace('ws');
    await entered.future;
    expect(cubit.state.members, isEmpty);
    expect(access.canPeek(key()), isFalse);
    release.complete();
    await loading;
    expect(cubit.state.listResponse, isNull);
    expect(cubit.state.error, isNull);
    expect(access.canPeek(key()), isFalse);
  });

  const retainedFailures = {
    'MFA': ApiException(message: 'MFA', statusCode: 403, code: 'MFA_REQUIRED'),
    'verification': ApiException(
      message: 'Verify',
      statusCode: 403,
      isVerificationRequired: true,
    ),
    'transport': ApiException(
      message: 'Offline',
      statusCode: 0,
      failureKind: ApiFailureKind.transport,
    ),
    'rate limit': ApiException(message: 'Retry', statusCode: 429),
    'server': ApiException(message: 'Unavailable', statusCode: 503),
  };
  for (final failure in retainedFailures.entries) {
    test('real cubit retains authorized rows for ${failure.key}', () async {
      final api = _Api();
      final queue = _Queue();
      when(
        queue.listPending,
      ).thenAnswer((_) async => <PendingMutationRecord>[]);
      const path = '/api/v1/workspaces/ws/habit-trackers?scope=self';
      when(() => api.getJson(path)).thenAnswer(
        (_) async => {
          'trackers': <dynamic>[],
          'members': [
            {'user_id': 'private-member', 'display_name': 'Private member'},
          ],
        },
      );
      final repo = HabitTrackerRepository(
        apiClient: api,
        cacheStore: store,
        mutationQueue: queue,
        currentUserId: () => 'owner',
      );
      final cubit = HabitsCubit(
        repository: repo,
        actorId: 'owner',
        currentUserId: () => 'owner',
        cacheStore: store,
        snapshotAccess: access,
      );
      addTearDown(cubit.close);
      await cubit.loadWorkspace('ws');
      when(() => api.getJson(path)).thenThrow(failure.value);
      await cubit.loadWorkspace('ws', refresh: true);
      expect(cubit.state.members.single.displayName, 'Private member');
      expect(await access.canRead(key()), isTrue);
    });
  }

  test('verification and MFA challenges preserve cached authorization', () {
    expect(habitsAccessDenied(denied), isTrue);
    expect(
      habitsAccessDenied(
        const ApiException(
          message: 'MFA',
          statusCode: 403,
          code: 'MFA_REQUIRED',
        ),
      ),
      isFalse,
    );
    expect(
      habitsAccessDenied(
        const ApiException(
          message: 'Verify',
          statusCode: 403,
          isVerificationRequired: true,
        ),
      ),
      isFalse,
    );
    expect(
      habitsAccessDenied(
        const ApiException(
          message: 'Offline',
          statusCode: 0,
          failureKind: ApiFailureKind.transport,
        ),
      ),
      isFalse,
    );
    expect(
      habitsAccessDenied(const ApiException(message: 'Retry', statusCode: 429)),
      isFalse,
    );
  });
}
