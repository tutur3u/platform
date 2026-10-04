import 'dart:async';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/core/cache/profile_banner_write.dart';
import 'package:mobile/data/repositories/profile_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import '../../helpers/offline_inventory_harness.dart';

class _Queue extends Fake implements OfflineMutationQueue {
  final records = <PendingMutationRecord>[];
  @override
  Future<bool> enqueueIfOffline({
    required String feature,
    required String method,
    required String path,
    required String workspaceId,
    Map<String, dynamic>? payload,
    String? entityId,
    bool replaySafe = false,
    String? expectedUserId,
  }) async => false;
  @override
  Future<bool> enqueueAfterNetworkFailure({
    required ApiException error,
    required String feature,
    required String method,
    required String path,
    required String workspaceId,
    required Map<String, dynamic> payload,
    required String entityId,
    required bool replaySafe,
    String? expectedUserId,
  }) async => false;
  @override
  Future<void> enqueue(PendingMutationRecord record) async {
    records.add(record);
  }
}

class _Api extends ApiClient {
  _Api() : super(baseUrl: 'http://localhost');
  @override
  Future<Map<String, dynamic>> postJson(
    String path,
    Object? body, {
    bool requiresAuth = true,
    Duration timeout = const Duration(seconds: 30),
  }) async => throw const ApiException(
    message: 'Permission denied for banner',
    statusCode: 403,
  );
}

class _Repository extends ProfileRepository {
  _Repository(_Api api, _Queue queue)
    : super(apiClient: api, bannerMutationQueue: queue);
  @override
  String? getCurrentUserIdSync() => 'actor';
}

void main() {
  test(
    'connectivity wait cannot relabel old banner payload with new actor',
    () async {
      final api = _Api();
      final harness = await OfflineInventoryHarness.create(api, online: false);
      var actor = 'old';
      var hold = false;
      final gate = Completer<List<ConnectivityResult>>();
      final queue = OfflineMutationQueue.forTesting(
        store: harness.store,
        userId: () => actor,
        checkConnectivity: () =>
            hold ? gate.future : Future.value([ConnectivityResult.none]),
        connectivityChanges: const Stream<List<ConnectivityResult>>.empty(),
      );
      await queue.init();
      await queue.synchronize();
      hold = true;
      final pending = queue.enqueueIfOffline(
        feature: 'profile',
        method: 'POST',
        path: '/banner',
        workspaceId: 'personal',
        payload: {'operationId': 'original'},
        entityId: 'old',
        expectedUserId: 'old',
        replaySafe: true,
      );
      await Future<void>.delayed(Duration.zero);
      actor = 'new';
      gate.complete([ConnectivityResult.none]);
      await expectLater(pending, throwsStateError);
      expect(await harness.store.listPendingMutations(), isEmpty);
      await queue.dispose();
      await harness.dispose();
      api.dispose();
    },
  );
  test(
    'server cleanup outage queues original stable operation receipt',
    () async {
      final queue = _Queue();
      final payload = {
        'action': 'remove',
        'operationId': 'stable-synthetic-operation',
      };
      await queueBannerWrite(
        actor: 'actor',
        method: 'POST',
        path: '/banner',
        payload: payload,
        currentActor: () => 'actor',
        queue: queue,
        send: () async => throw const ApiException(
          message: 'Cleanup pending',
          statusCode: 503,
        ),
      );
      expect(queue.records.single.payload, payload);
      expect(queue.records.single.userId, 'actor');
      expect(queue.records.single.replaySafe, isTrue);
      expect(queue.records.single.lastError, 'Cleanup pending');
    },
  );
  test('account change never queues old actor server failure', () async {
    final queue = _Queue();
    await expectLater(
      queueBannerWrite(
        actor: 'old',
        method: 'POST',
        path: '/banner',
        payload: {},
        currentActor: () => 'new',
        queue: queue,
        send: () async => throw const ApiException(
          message: 'Cleanup pending',
          statusCode: 503,
        ),
      ),
      throwsA(isA<ApiException>()),
    );
    expect(queue.records, isEmpty);
  });
  test('removeBanner preserves ApiException permission message', () async {
    final api = _Api();
    final queue = _Queue();
    final repository = _Repository(api, queue);
    final result = await repository.removeBanner();
    expect(result.success, isFalse);
    expect(result.error, 'Permission denied for banner');
    expect(queue.records, isEmpty);
    repository.dispose();
    api.dispose();
  });
}
