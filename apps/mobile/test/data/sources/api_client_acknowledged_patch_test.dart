import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/data/sources/api_verification.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class _Client extends Mock implements SupabaseClient {}

class _Auth extends Mock implements GoTrueClient {}

class _Session extends Mock implements Session {}

void main() {
  const actor = '33333333-3333-4333-8333-333333333333';
  const user = User(
    id: actor,
    appMetadata: {},
    userMetadata: {},
    aud: 'authenticated',
    createdAt: '2026-01-01',
  );
  late _Client client;
  late _Auth auth;
  late _Session session;
  setUp(() {
    client = _Client();
    auth = _Auth();
    session = _Session();
    when(() => client.auth).thenReturn(auth);
    when(() => auth.currentUser).thenReturn(user);
    when(() => auth.currentSession).thenReturn(session);
    when(() => session.accessToken).thenReturn('synthetic-access');
    when(() => session.expiresAt).thenReturn(
      DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/
          1000,
    );
  });
  tearDown(() => ApiVerification.requestToken = null);
  for (final status in [200, 401, 403, 429, 500]) {
    test('acknowledged PATCH dispatches once for HTTP $status', () async {
      var requests = 0;
      var prompts = 0;
      ApiVerification.requestToken = () async {
        prompts++;
        return 'fixture';
      };
      final api = ApiClient(
        baseUrl: 'https://example.test',
        authClient: client,
        httpClient: MockClient((request) async {
          requests++;
          expect(request.method, 'PATCH');
          expect(request.headers['authorization'], 'Bearer synthetic-access');
          return http.Response(
            '{}',
            status,
            headers: status == 403 ? {'x-abuse-challenge': 'turnstile'} : {},
          );
        }),
      );
      addTearDown(api.dispose);
      final result = api.patchJsonAcknowledged(
        '/settings',
        const {},
        actorId: actor,
        isCurrent: () => true,
      );
      if (status == 200) {
        expect(await result, isEmpty);
      } else {
        await expectLater(result, throwsA(isA<ApiException>()));
      }
      expect(requests, 1);
      expect(prompts, 0);
      verifyNever(() => auth.refreshSession());
    });
  }
  test('transport uncertainty has no retry', () async {
    var requests = 0;
    final api = ApiClient(
      baseUrl: 'https://example.test',
      authClient: client,
      httpClient: MockClient((_) async {
        requests++;
        throw TimeoutException('fixture');
      }),
    );
    addTearDown(api.dispose);
    await expectLater(
      api.patchJsonAcknowledged(
        '/settings',
        const {},
        actorId: actor,
        isCurrent: () => true,
      ),
      throwsA(isA<ApiException>()),
    );
    expect(requests, 1);
  });
  test(
    'selection departure during credential preparation prevents HTTP',
    () async {
      var requests = 0;
      var current = true;
      final refresh = Completer<AuthResponse>();
      when(() => session.expiresAt).thenReturn(0);
      when(() => auth.refreshSession()).thenAnswer((_) => refresh.future);
      final api = ApiClient(
        baseUrl: 'https://example.test',
        authClient: client,
        httpClient: MockClient((_) async {
          requests++;
          return http.Response('{}', 200);
        }),
      );
      addTearDown(api.dispose);
      final result = api.patchJsonAcknowledged(
        '/settings',
        const {},
        actorId: actor,
        isCurrent: () => current,
      );
      final observed = expectLater(result, throwsA(isA<ApiException>()));
      await Future<void>.delayed(Duration.zero);
      current = false;
      refresh.complete(AuthResponse(session: session, user: user));
      await observed;
      expect(requests, 0);
    },
  );
  test('departed selection cannot accept an in-flight HTTP receipt', () async {
    var requests = 0;
    var current = true;
    final response = Completer<http.Response>();
    final api = ApiClient(
      baseUrl: 'https://example.test',
      authClient: client,
      httpClient: MockClient((_) {
        requests++;
        return response.future;
      }),
    );
    addTearDown(api.dispose);
    final result = api.patchJsonAcknowledged(
      '/settings',
      const {},
      actorId: actor,
      isCurrent: () => current,
    );
    final observed = expectLater(result, throwsA(isA<ApiException>()));
    await Future<void>.delayed(Duration.zero);
    expect(requests, 1);
    current = false;
    response.complete(http.Response('{}', 200));
    await observed;
    expect(requests, 1);
  });
}
