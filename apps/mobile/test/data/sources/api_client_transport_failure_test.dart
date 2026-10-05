import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/core/cache/offline_network.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/data/sources/api_verification.dart';
import 'package:mobile/data/sources/offline_api_request.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class _AuthClient extends Mock implements SupabaseClient {}

class _Auth extends Mock implements GoTrueClient {}

class _Session extends Mock implements Session {}

class _StreamClient extends http.BaseClient {
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async =>
      http.StreamedResponse(
        Stream.fromIterable([
          [1, 2],
          [3, 4],
        ]),
        200,
      );
}

const _user = User(
  id: 'synthetic-user',
  appMetadata: {},
  userMetadata: {},
  aud: 'authenticated',
  createdAt: '2026-01-01',
);

void main() {
  for (final failure in <Object>[
    const SocketException('synthetic'),
    TimeoutException('synthetic'),
    http.ClientException('synthetic'),
    StateError('synthetic'),
    const FormatException('synthetic'),
  ]) {
    test('only actual transport qualifies: ${failure.runtimeType}', () async {
      final api = ApiClient(
        baseUrl: 'https://example.test',
        httpClient: MockClient((_) async {
          if (failure is Exception) throw failure;
          if (failure is Error) throw failure;
          throw StateError('Invalid synthetic failure');
        }),
      );
      addTearDown(api.dispose);
      await expectLater(
        api.getJson('/test', requiresAuth: false),
        throwsA(
          isA<ApiException>().having(
            isOfflineTransportFailure,
            'offline',
            failure is SocketException ||
                failure is TimeoutException ||
                failure is http.ClientException,
          ),
        ),
      );
    });
  }

  for (final body in ['<html>bad gateway</html>', '[]', '42', '{']) {
    test(
      'successful malformed object response is not offline: $body',
      () async {
        final api = ApiClient(
          baseUrl: 'https://example.test',
          httpClient: MockClient((_) async => http.Response(body, 200)),
        );
        addTearDown(api.dispose);
        await expectLater(
          api.getJson('/test', requiresAuth: false),
          throwsA(
            isA<ApiException>()
                .having((e) => e.failureKind, 'kind', ApiFailureKind.response)
                .having(isOfflineTransportFailure, 'offline', false),
          ),
        );
        if (body == '[]') {
          expect(await api.getJsonList('/test', requiresAuth: false), isEmpty);
        } else {
          await expectLater(
            api.getJsonList('/test', requiresAuth: false),
            throwsA(
              isA<ApiException>().having(
                isOfflineTransportFailure,
                'offline',
                false,
              ),
            ),
          );
        }
      },
    );
  }

  test('unclassified status zero and auth/contract errors fail closed', () {
    for (final error in [
      const ApiException(message: 'No ticket', statusCode: 0),
      const ApiException(message: 'Forbidden', statusCode: 403),
      const ApiException(
        message: 'Invalid response',
        statusCode: 0,
        failureKind: ApiFailureKind.response,
      ),
    ]) {
      expect(isOfflineTransportFailure(error), isFalse);
    }
    expect(
      isOfflineTransportFailure(
        const ApiException.transport(message: 'Connection lost'),
      ),
      isTrue,
    );
  });

  test(
    'refresh timeout is a session failure, never cached offline fallback',
    () async {
      final client = _AuthClient();
      final auth = _Auth();
      when(() => client.auth).thenReturn(auth);
      when(() => auth.currentUser).thenReturn(_user);
      when(() => auth.currentSession).thenReturn(null);
      when(auth.refreshSession).thenThrow(TimeoutException('synthetic'));
      var calls = 0;
      final api = ApiClient(
        baseUrl: 'https://example.test',
        authClient: client,
        httpClient: MockClient((_) async {
          calls++;
          return http.Response('{}', 200);
        }),
      );
      addTearDown(api.dispose);
      await expectLater(
        api.getJson('/test'),
        throwsA(
          isA<ApiException>()
              .having((e) => e.failureKind, 'kind', ApiFailureKind.session)
              .having(isOfflineTransportFailure, 'offline', false),
        ),
      );
      expect(calls, 0);
    },
  );

  test('challenge callback failure is not an API transport outage', () async {
    final client = _AuthClient();
    final auth = _Auth();
    final session = _Session();
    when(() => client.auth).thenReturn(auth);
    when(() => auth.currentUser).thenReturn(_user);
    when(() => auth.currentSession).thenReturn(session);
    when(() => session.accessToken).thenReturn('synthetic-token');
    when(() => session.expiresAt).thenReturn(
      DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/
          1000,
    );
    ApiVerification.requestToken = () async =>
        throw TimeoutException('synthetic');
    addTearDown(() => ApiVerification.requestToken = null);
    final api = ApiClient(
      baseUrl: 'https://example.test',
      authClient: client,
      httpClient: MockClient(
        (_) async => http.Response(
          '{}',
          403,
          headers: {'x-abuse-challenge': 'turnstile'},
        ),
      ),
    );
    addTearDown(api.dispose);
    await expectLater(
      api.getJson('/test'),
      throwsA(
        isA<ApiException>()
            .having((e) => e.failureKind, 'kind', ApiFailureKind.session)
            .having(isOfflineTransportFailure, 'offline', false),
      ),
    );
  });

  test(
    'stream size overflow is contract failure, never offline fallback',
    () async {
      final client = _AuthClient();
      final auth = _Auth();
      final session = _Session();
      when(() => client.auth).thenReturn(auth);
      when(() => auth.currentUser).thenReturn(_user);
      when(() => auth.currentSession).thenReturn(session);
      when(() => session.accessToken).thenReturn('synthetic-token');
      when(() => session.expiresAt).thenReturn(
        DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/
            1000,
      );
      final api = ApiClient(
        baseUrl: 'https://example.test',
        authClient: client,
        httpClient: _StreamClient(),
      );
      addTearDown(api.dispose);
      await expectLater(
        api.getBytes('/test', maxBytes: 3),
        throwsA(
          isA<ApiException>()
              .having((e) => e.failureKind, 'kind', ApiFailureKind.response)
              .having(isOfflineTransportFailure, 'offline', false),
        ),
      );
    },
  );

  test('paced lane wait does not consume the HTTP timeout', () async {
    final gate = Completer<void>();
    var calls = 0;
    final api = ApiClient(
      baseUrl: 'https://example.test',
      requestTimeout: const Duration(milliseconds: 20),
      httpClient: MockClient((_) async {
        calls++;
        return http.Response('{}', 200);
      }),
    );
    addTearDown(api.dispose);
    await ApiClient.offlinePreparation(() async {
      final blocker = OfflineApiRequest.paced(() => gate.future);
      final waiting = api.getJson('/test', requiresAuth: false);
      await Future<void>.delayed(const Duration(milliseconds: 60));
      expect(calls, 0);
      gate.complete();
      await blocker;
      expect(await waiting, isEmpty);
    });
    expect(calls, 1);
  });

  test('dispatched HTTP still enforces its timeout', () async {
    final api = ApiClient(
      baseUrl: 'https://example.test',
      requestTimeout: const Duration(milliseconds: 20),
      httpClient: MockClient((_) async {
        await Future<void>.delayed(const Duration(milliseconds: 100));
        return http.Response('{}', 200);
      }),
    );
    addTearDown(api.dispose);
    await expectLater(
      api.getJson('/test', requiresAuth: false),
      throwsA(
        isA<ApiException>().having(isOfflineTransportFailure, 'offline', true),
      ),
    );
  });
}
