import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'offline_inventory_harness.dart';

class _Client extends Mock implements SupabaseClient {}

class _Auth extends Mock implements GoTrueClient {}

class _Session extends Mock implements Session {}

/// Synthetic HTTP/auth transport with the real repository and encrypted outbox.
class InventoryApiContractHarness {
  static const workspace = '33333333-3333-4333-8333-333333333333';
  static const product = '44444444-4444-4444-8444-444444444444';
  static const resource = '55555555-5555-4555-8555-555555555555';
  static const invoice = '66666666-6666-4666-8666-666666666666';
  static const root = '/api/v1/workspaces/$workspace';

  late final ApiClient api;
  late final OfflineInventoryHarness persistence;
  late final InventoryRepository repository;
  final requests = <http.Request>[];
  late Future<http.Response> Function(http.Request) respond;

  static http.Response json(Object value, {int status = 200}) => http.Response(
    jsonEncode(value),
    status,
    headers: {'content-type': 'application/json'},
  );

  Future<void> init() async {
    final client = _Client();
    final auth = _Auth();
    final session = _Session();
    when(() => client.auth).thenReturn(auth);
    when(() => auth.currentUser).thenReturn(
      const User(
        id: 'actor',
        appMetadata: {},
        userMetadata: {},
        aud: 'authenticated',
        createdAt: '2026-01-01',
      ),
    );
    when(() => auth.currentSession).thenReturn(session);
    when(auth.refreshSession).thenAnswer(
      (_) async => AuthResponse(session: session, user: auth.currentUser),
    );
    when(() => session.accessToken).thenReturn('synthetic-access');
    when(() => session.expiresAt).thenReturn(
      DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/
          1000,
    );
    respond = (_) async =>
        json({'message': 'Unexpected fixture request'}, status: 404);
    api = ApiClient(
      baseUrl: 'https://example.test',
      authClient: client,
      httpClient: MockClient((request) async {
        requests.add(request);
        expect(request.headers['authorization'], 'Bearer synthetic-access');
        return await respond(request);
      }),
    );
    persistence = await OfflineInventoryHarness.create(api);
    repository = InventoryRepository(
      apiClient: api,
      cacheStore: persistence.store,
      mutationQueue: persistence.queue,
      cacheUserId: () => 'actor',
      networkAvailable: () async => true,
    );
  }

  Future<void> dispose() async {
    try {
      await persistence.dispose();
    } finally {
      api.dispose();
    }
  }
}
