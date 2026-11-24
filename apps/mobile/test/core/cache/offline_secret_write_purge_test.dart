import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class _Storage extends Mock implements FlutterSecureStorage {}

PendingMutationRecord _record(
  String id, {
  required String method,
  required String path,
  String feature = 'settings',
  String? entityId,
  Map<String, dynamic>? payload,
}) {
  return PendingMutationRecord(
    id: id,
    feature: feature,
    method: method,
    path: path,
    createdAt: DateTime.utc(2026, 11, 24),
    userId: 'synthetic-owner',
    workspaceId: 'ws',
    payload: payload,
    optimisticPatch: entityId == null ? null : {'entityId': entityId},
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'init drops queued secret creates and updates with their values',
    () async {
      final directory = await Directory.systemTemp.createTemp('secret-purge-');
      final storage = _Storage();
      when(
        () => storage.read(key: any(named: 'key')),
      ).thenAnswer((_) async => null);
      when(
        () => storage.write(
          key: any(named: 'key'),
          value: any(named: 'value'),
        ),
      ).thenAnswer((_) async {});
      final store = CacheStore.forTesting(
        secureStorage: storage,
        directoryResolver: () async => directory,
      );
      await store.init();
      const secrets = '/api/workspaces/ws/secrets';
      for (final record in [
        _record(
          'create',
          method: 'WORKSPACE_SECRET_CREATE',
          path: secrets,
          entityId: 'local-1',
          payload: {'name': 'X_TOKEN', 'value': 'queued-secret-value'},
        ),
        _record(
          'update',
          method: 'PUT',
          path: '$secrets/server-1',
          entityId: 'server-1',
          payload: {'name': 'X_TOKEN', 'value': 'queued-secret-value'},
        ),
        _record(
          'delete-local',
          method: 'DELETE',
          path: '$secrets/local-1',
          entityId: 'local-1',
        ),
        _record(
          'delete-server',
          method: 'DELETE',
          path: '$secrets/server-2',
          entityId: 'server-2',
        ),
        _record(
          'other-put',
          method: 'PUT',
          path: '/api/v1/workspaces/ws/settings/profile',
        ),
      ]) {
        await store.savePendingMutation(record);
      }

      final queue = OfflineMutationQueue.forTesting(
        store: store,
        userId: () => 'synthetic-owner',
        checkConnectivity: () async => [ConnectivityResult.none],
        connectivityChanges: const Stream<List<ConnectivityResult>>.empty(),
        authChanges: const Stream<AuthState>.empty(),
      );
      try {
        await queue.init();
        final remaining = await store.listPendingMutations();
        expect(remaining.map((record) => record.id).toSet(), {
          'delete-server',
          'other-put',
        });
        expect(
          remaining.any(
            (record) =>
                record.payload.toString().contains('queued-secret-value'),
          ),
          isFalse,
        );
      } finally {
        await queue.dispose();
        await directory.delete(recursive: true);
      }
    },
  );
}
