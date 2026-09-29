import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mocktail/mocktail.dart';

class _SecureStorage extends Mock implements FlutterSecureStorage {}

void main() {
  late Directory directory;
  late _SecureStorage secureStorage;
  late Map<String, String> secrets;
  late CacheStore store;

  setUp(() async {
    directory = await Directory.systemTemp.createTemp('mobile-replica-test-');
    secureStorage = _SecureStorage();
    secrets = {};
    when(
      () => secureStorage.read(key: any(named: 'key')),
    ).thenAnswer((call) async => secrets[call.namedArguments[#key] as String]);
    when(
      () => secureStorage.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((call) async {
      secrets[call.namedArguments[#key] as String] =
          call.namedArguments[#value] as String;
    });
    store = CacheStore.forTesting(
      secureStorage: secureStorage,
      directoryResolver: () async => directory,
    );
  });

  tearDown(() async {
    await store.closeForTesting();
    await Hive.close();
    if (directory.existsSync()) directory.deleteSync(recursive: true);
  });

  const key = CacheKey(
    namespace: 'notes.list',
    userId: 'user_1',
    workspaceId: 'ws_1',
  );

  test(
    'indexes snapshot rows and overlays account-scoped pending edits',
    () async {
      await store.write(
        key: key,
        policy: CachePolicies.moduleData,
        payload: [
          {'id': 'note_1', 'title': 'Original'},
          {'id': 'note_2', 'title': 'Remove me'},
        ],
      );
      await store.savePendingMutation(
        PendingMutationRecord(
          id: 'edit_1',
          feature: 'notes',
          method: 'PUT',
          path: '/api/v1/workspaces/ws_1/notes/note_1',
          createdAt: DateTime.utc(2026, 9, 28),
          userId: 'user_1',
          workspaceId: 'ws_1',
          payload: {'title': 'Edited offline'},
          optimisticPatch: const {'entityId': 'note_1'},
        ),
      );
      await store.savePendingMutation(
        PendingMutationRecord(
          id: 'delete_1',
          feature: 'notes',
          method: 'DELETE',
          path: '/api/v1/workspaces/ws_1/notes/note_2',
          createdAt: DateTime.utc(2026, 9, 28, 1),
          userId: 'user_1',
          workspaceId: 'ws_1',
          optimisticPatch: const {'entityId': 'note_2'},
        ),
      );
      final rows = await store.queryReplica(
        namespace: 'notes.list',
        userId: 'user_1',
        workspaceId: 'ws_1',
        pendingFeature: 'notes',
        pendingPathContains: '/notes',
      );
      expect(rows.map((row) => row.id), ['note_1']);
      expect(rows.single.payload['title'], 'Edited offline');
      expect(rows.single.pendingStatus, PendingMutationStatus.queued);
      expect(
        await store.queryReplica(
          namespace: 'notes.list',
          userId: 'other_user',
          workspaceId: 'ws_1',
        ),
        isEmpty,
      );
      expect(
        await store.queryReplica(
          namespace: 'notes.list',
          userId: 'user_1',
          workspaceId: 'other_workspace',
        ),
        isEmpty,
      );
    },
  );

  test(
    'rebuilds the entity index from persisted snapshots and clears it',
    () async {
      await store.write(
        key: key,
        policy: CachePolicies.moduleData,
        payload: [
          {'id': 'note_1', 'title': 'Persisted'},
        ],
      );
      await store.closeForTesting();
      await Hive.deleteBoxFromDisk('offline_entities_v1');
      store = CacheStore.forTesting(
        secureStorage: secureStorage,
        directoryResolver: () async => directory,
      );
      final restored = await store.queryReplica(
        namespace: 'notes.list',
        userId: 'user_1',
        workspaceId: 'ws_1',
      );
      expect(restored.single.payload['title'], 'Persisted');
      await store.clearScope(userId: 'user_1', workspaceId: 'ws_1');
      expect(
        await store.queryReplica(
          namespace: 'notes.list',
          userId: 'user_1',
          workspaceId: 'ws_1',
        ),
        isEmpty,
      );
    },
  );

  test(
    'persists local ID mappings and removes them with their account',
    () async {
      await store.saveLocalIdMapping(
        userId: 'user_1',
        workspaceId: 'ws_1',
        feature: 'cms',
        localId: 'local_1',
        serverId: 'server_1',
      );
      await store.saveLocalIdMapping(
        userId: 'user_1',
        workspaceId: 'ws_1',
        feature: 'tasks',
        localId: 'local_task',
        serverId: 'server_task',
      );
      await store.closeForTesting();
      store = CacheStore.forTesting(
        secureStorage: secureStorage,
        directoryResolver: () async => directory,
      );
      expect(
        await store.localIdMappings(
          userId: 'user_1',
          workspaceId: 'ws_1',
          feature: 'cms',
        ),
        {'local_1': 'server_1'},
      );
      expect(
        await store.localIdMappingsForScope(
          userId: 'user_1',
          workspaceId: 'ws_1',
        ),
        {'local_1': 'server_1', 'local_task': 'server_task'},
      );
      expect(
        await store.localIdMappingsForScope(
          userId: 'user_1',
          workspaceId: 'ws_2',
        ),
        isEmpty,
      );
      expect(
        await store.localIdMappings(
          userId: 'user_2',
          workspaceId: 'ws_1',
          feature: 'cms',
        ),
        isEmpty,
      );
      await store.clearScope(userId: 'user_1', workspaceId: 'ws_1');
      expect(
        await store.localIdMappingsForScope(
          userId: 'user_1',
          workspaceId: 'ws_1',
        ),
        isEmpty,
      );
      expect(
        await store.localIdMappings(
          userId: 'user_1',
          workspaceId: 'ws_1',
          feature: 'cms',
        ),
        isEmpty,
      );
    },
  );
}
