import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/data/sources/api_verification.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../helpers/offline_inventory_harness.dart';

class _Client extends Mock implements SupabaseClient {}

class _Auth extends Mock implements GoTrueClient {}

class _Session extends Mock implements Session {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const owner = User(
    id: 'actor',
    appMetadata: {},
    userMetadata: {},
    aud: 'authenticated',
    createdAt: '2026-01-01',
  );
  const localId = '22222222-2222-4222-8222-222222222222';
  const serverId = '11111111-1111-4111-8111-111111111111';
  const workspace = '33333333-3333-4333-8333-333333333333';
  const path = '/api/v1/workspaces/$workspace/product-categories';
  late _Auth auth;
  late ApiClient api;
  late OfflineInventoryHarness harness;
  late List<http.Request> requests;
  late Future<http.Response> Function(http.Request) respond;
  late int prompts;

  http.Response challenge() => http.Response(
    '{"message":"Verification required"}',
    403,
    headers: {'x-abuse-challenge': 'turnstile'},
  );
  http.Response acknowledged() => http.Response(
    jsonEncode({
      'contract': 'inventory-offline-create-v1',
      'resource': 'category',
      'data': {'id': serverId, 'name': 'Synthetic'},
    }),
    200,
  );

  setUp(() async {
    auth = _Auth();
    final client = _Client();
    final session = _Session();
    when(() => client.auth).thenReturn(auth);
    when(() => auth.currentUser).thenReturn(owner);
    when(() => auth.currentSession).thenReturn(session);
    when(() => session.accessToken).thenReturn('synthetic-access');
    when(() => session.expiresAt).thenReturn(
      DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/
          1000,
    );
    requests = [];
    prompts = 0;
    respond = (_) async => challenge();
    ApiVerification.requestToken = () async {
      prompts++;
      return 'synthetic-one-use-token';
    };
    api = ApiClient(
      baseUrl: 'https://example.test',
      authClient: client,
      httpClient: MockClient((request) async {
        requests.add(request);
        return await respond(request);
      }),
    );
    harness = await OfflineInventoryHarness.create(api);
  });
  tearDown(() async {
    ApiVerification.requestToken = null;
    await harness.dispose();
    api.dispose();
  });

  Future<Map<String, dynamic>?> create({bool borrowed = true}) =>
      harness.queue.performInventoryMutation(
        feature: 'inventory',
        method: 'POST',
        path: path,
        workspaceId: workspace,
        entityId: localId,
        payload: {'name': 'Synthetic'},
        apiClient: borrowed ? api : null,
      );

  test(
    'foreground durable create prompts and verifies once with same identity',
    () async {
      respond = (_) async =>
          requests.length == 1 ? challenge() : acknowledged();
      final result = await create();
      expect(result?['id'], serverId);
      expect(prompts, 1);
      expect(requests, hasLength(2));
      expect(requests.first.headers['x-tuturuuu-turnstile-token'], isNull);
      expect(
        requests.last.headers['x-tuturuuu-turnstile-token'],
        'synthetic-one-use-token',
      );
      expect(requests.first.body, requests.last.body);
      final body = jsonDecode(requests.first.body) as Map<String, dynamic>;
      expect(body['operation_id'], localId);
      expect(await harness.queue.listPending(), isEmpty);
      expect(ApiVerification.token, isNull);
    },
  );

  test(
    'foreground factory client also verifies and never persists token',
    () async {
      respond = (_) async => requests.length == 1
          ? challenge()
          : http.Response('{"message":"Temporarily unavailable"}', 503);
      expect(await create(borrowed: false), isNull);
      expect(prompts, 1);
      expect(requests, hasLength(2));
      expect(requests.map((request) => (request.method, request.url.path)), [
        ('POST', '/api/v1/workspaces/$workspace/inventory/offline-mutations'),
        ('POST', '/api/v1/workspaces/$workspace/inventory/offline-mutations'),
      ]);
      expect(requests.first.body, requests.last.body);
      expect(
        requests[1].headers['x-tuturuuu-turnstile-token'],
        'synthetic-one-use-token',
      );
      final retained = (await harness.queue.listPending()).single;
      expect(retained.entityId, localId);
      expect(retained.status, PendingMutationStatus.queued);
      expect(
        retained.toJson().toString(),
        isNot(contains('synthetic-one-use-token')),
      );
      expect(ApiVerification.token, isNull);
    },
  );

  test(
    'background challenge never prompts and retains durable record',
    () async {
      await harness.store.savePendingMutation(
        PendingMutationRecord(
          id: localId,
          feature: 'inventory',
          userId: 'actor',
          workspaceId: workspace,
          method: 'POST',
          path: path,
          payload: {'name': 'Synthetic'},
          optimisticPatch: {'entityId': localId},
          createdAt: DateTime.utc(2026, 10, 3),
        ),
      );
      await harness.queue.drain();
      expect(requests, hasLength(1));
      expect(prompts, 0);
      final record = (await harness.queue.listPending()).single;
      expect(record.status, PendingMutationStatus.queued);
      expect(record.id, localId);
    },
  );

  test(
    'canceling verification keeps one pending Save for automatic replay',
    () async {
      ApiVerification.requestToken = () async {
        prompts++;
        return null;
      };
      expect(await create(), isNull);
      expect(prompts, 1);
      expect(requests, hasLength(1));
      final pending = (await harness.queue.listPending()).single;
      expect(pending.entityId, localId);
      expect(pending.status, PendingMutationStatus.queued);
      expect(pending.acknowledgedServerId, isNull);
      final originalBody = requests.single.body;
      respond = (_) async => acknowledged();
      await harness.queue.synchronize();
      expect(prompts, 1);
      expect(requests, hasLength(2));
      expect(requests.last.body, originalBody);
      expect(await harness.queue.listPending(), isEmpty);
      expect(ApiVerification.token, isNull);
    },
  );

  test(
    'account switch during challenge prevents authenticated retry',
    () async {
      ApiVerification.requestToken = () async {
        prompts++;
        when(() => auth.currentUser).thenReturn(
          const User(
            id: 'other-actor',
            appMetadata: {},
            userMetadata: {},
            aud: 'authenticated',
            createdAt: '2026-01-01',
          ),
        );
        return 'synthetic-one-use-token';
      };
      await expectLater(
        create(),
        throwsA(isA<ApiException>().having((e) => e.statusCode, 'status', 401)),
      );
      expect(prompts, 1);
      expect(requests, hasLength(1));
      final record = (await harness.queue.listPending()).single;
      expect(record.userId, 'actor');
      expect(record.status, PendingMutationStatus.queued);
      expect(record.acknowledgedServerId, isNull);
    },
  );

  test('membership denial remains permanent and never prompts', () async {
    respond = (_) async => http.Response('{"message":"Forbidden"}', 403);
    await expectLater(
      create(),
      throwsA(
        isA<ApiException>()
            .having((e) => e.statusCode, 'status', 403)
            .having((e) => e.isVerificationRequired, 'verification', false),
      ),
    );
    expect(prompts, 0);
    expect(requests, hasLength(1));
    expect(
      (await harness.queue.listPending()).single.status,
      PendingMutationStatus.failed,
    );
  });
}
