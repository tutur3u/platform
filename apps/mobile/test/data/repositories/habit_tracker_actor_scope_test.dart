import 'dart:async';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/data/models/habit_tracker.dart';
import 'package:mobile/data/repositories/habit_tracker_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _Storage extends Mock implements FlutterSecureStorage {}

class _Api extends Mock implements ApiClient {}

class _Queue extends Mock implements OfflineMutationQueue {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory directory;
  late CacheStore store;
  late _Api api;
  late _Queue queue;
  late HabitTrackerRepository repository;
  late String actor;

  setUp(() async {
    directory = await Directory.systemTemp.createTemp('habit-actor-');
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
    store = CacheStore.forTesting(
      secureStorage: storage,
      directoryResolver: () async => directory,
    );
    api = _Api();
    queue = _Queue();
    actor = 'owner';
    when(() => api.checkUser(any())).thenAnswer((call) {
      if (call.positionalArguments.single != actor) {
        throw const ApiException(message: 'Account changed', statusCode: 401);
      }
    });
    repository = HabitTrackerRepository(
      apiClient: api,
      cacheStore: store,
      mutationQueue: queue,
      expectedUserId: 'owner',
    );
  });
  tearDown(() async {
    await store.closeForTesting();
    await Hive.close();
    await directory.delete(recursive: true);
  });

  const base = '/api/v1/workspaces/ws/habit-trackers';
  const path = '$base?scope=self';
  Map<String, dynamic> tracker(String id) => {
    'id': id,
    'ws_id': 'ws',
    'name': id,
  };
  PendingMutationRecord pending(String user, String id, {String? target}) =>
      PendingMutationRecord(
        id: id,
        feature: 'habits',
        method: 'POST',
        path: target == null ? base : '$base/tracker/entries',
        userId: user,
        workspaceId: 'ws',
        createdAt: DateTime.utc(2026),
        optimisticPatch: {'entityId': id},
        payload: target == null
            ? tracker(id)
            : {
                'user_id': target,
                'values': {'count': 1},
              },
      );
  Future<List<String>> read() => CacheStore.awaitRevalidation(
    () async => (await repository.listTrackers(
      'ws',
    )).trackers.map((r) => r.tracker.id).toList(),
  );
  void unbound() {
    repository = HabitTrackerRepository(
      apiClient: api,
      cacheStore: store,
      mutationQueue: queue,
      currentUserId: () => actor,
    );
  }

  test(
    'unbound list overlays only original account pending trackers',
    () async {
      unbound();
      when(
        () => api.getJson(path),
      ).thenAnswer((_) async => {'trackers': <dynamic>[]});
      when(() => queue.listPending()).thenAnswer(
        (_) async => [pending('owner', 'mine'), pending('other', 'private')],
      );
      expect(await read(), ['mine']);
    },
  );
  test('delayed queue cannot return departed account content', () async {
    unbound();
    final entered = Completer<void>();
    final response = Completer<List<PendingMutationRecord>>();
    when(
      () => api.getJson(path),
    ).thenAnswer((_) async => {'trackers': <dynamic>[]});
    when(() => queue.listPending()).thenAnswer((_) {
      entered.complete();
      return response.future;
    });
    final reading = read();
    final assertion = expectLater(reading, throwsA(isA<ApiException>()));
    await entered.future;
    actor = 'other';
    response.complete([pending('owner', 'mine')]);
    await assertion;
  });
  test(
    'late list request retains original account before queue access',
    () async {
      unbound();
      final entered = Completer<void>();
      final response = Completer<Map<String, dynamic>>();
      when(() => api.getJson(path)).thenAnswer((_) {
        entered.complete();
        return response.future;
      });
      final reading = read();
      final assertion = expectLater(reading, throwsA(isA<ApiException>()));
      await entered.future;
      actor = 'other';
      response.complete({'trackers': <dynamic>[]});
      await assertion;
      verifyNever(() => queue.listPending());
    },
  );
  test(
    'member detail overlays only owned edits for that target member',
    () async {
      unbound();
      when(
        () => api.getJson('$base/tracker?scope=member&userId=member'),
      ).thenAnswer(
        (_) async => {'tracker': tracker('tracker'), 'entries': <dynamic>[]},
      );
      when(() => queue.listPending()).thenAnswer(
        (_) async => [
          pending('owner', 'member-log', target: 'member'),
          pending('owner', 'self-log', target: 'owner'),
          pending('other', 'private', target: 'member'),
        ],
      );
      final result = await repository.getTrackerDetail(
        'ws',
        'tracker',
        scope: HabitTrackerScope.member,
        userId: 'member',
      );
      expect(result.entries.map((entry) => entry.id), ['member-log']);
    },
  );
  test('member detail retains owned delete without a target payload', () async {
    unbound();
    when(
      () => api.getJson('$base/tracker?scope=member&userId=member'),
    ).thenAnswer(
      (_) async => {
        'tracker': tracker('tracker'),
        'entries': [
          {
            'id': 'deleted',
            'ws_id': 'ws',
            'tracker_id': 'tracker',
            'user_id': 'member',
          },
          {
            'id': 'retained',
            'ws_id': 'ws',
            'tracker_id': 'tracker',
            'user_id': 'member',
          },
        ],
      },
    );
    when(queue.listPending).thenAnswer(
      (_) async => [
        PendingMutationRecord(
          id: 'delete',
          feature: 'habits',
          method: 'DELETE',
          path: '$base/tracker/entries/deleted',
          userId: 'owner',
          workspaceId: 'ws',
          createdAt: DateTime.utc(2026),
          optimisticPatch: {'entityId': 'deleted'},
        ),
        PendingMutationRecord(
          id: 'private-delete',
          feature: 'habits',
          method: 'DELETE',
          path: '$base/tracker/entries/retained',
          userId: 'other',
          workspaceId: 'ws',
          createdAt: DateTime.utc(2026),
          optimisticPatch: {'entityId': 'retained'},
        ),
        pending('owner', 'self-log', target: 'owner'),
      ],
    );
    final result = await repository.getTrackerDetail(
      'ws',
      'tracker',
      scope: HabitTrackerScope.member,
      userId: 'member',
    );
    expect(result.entries.map((entry) => entry.id), ['retained']);
  });
  test('anonymous detail cannot publish after account signs in', () async {
    String? owner;
    repository = HabitTrackerRepository(
      apiClient: api,
      cacheStore: store,
      mutationQueue: queue,
      currentUserId: () => owner,
    );
    final entered = Completer<void>();
    final response = Completer<Map<String, dynamic>>();
    when(() => api.getJson('$base/tracker?scope=self')).thenAnswer((_) {
      entered.complete();
      return response.future;
    });
    final reading = repository.getTrackerDetail('ws', 'tracker');
    final assertion = expectLater(reading, throwsA(isA<ApiException>()));
    await entered.future;
    owner = 'owner';
    response.complete({'tracker': tracker('tracker')});
    await assertion;
  });
  test('anonymous writes cannot enter queue', () async {
    repository = HabitTrackerRepository(
      apiClient: api,
      mutationQueue: queue,
      currentUserId: () => null,
    );
    await expectLater(
      repository.archiveTracker('ws', 'tracker'),
      throwsA(isA<ApiException>()),
    );
    verifyNever(() => api.deleteJson(any()));
  });
  test('departed bound actor cannot start a write', () async {
    actor = 'other';
    await expectLater(
      repository.archiveTracker('ws', 'tracker'),
      throwsA(isA<ApiException>()),
    );
    verifyNever(() => api.deleteJson(any()));
  });
}
