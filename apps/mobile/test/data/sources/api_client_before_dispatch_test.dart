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
  const user = User(
    id: '33333333-3333-4333-8333-333333333333',
    appMetadata: {},
    userMetadata: {},
    aud: 'authenticated',
    createdAt: '2026-01-01',
  );
  late _Client client;
  late _Auth auth;
  late _Session session;
  late List<String> log;

  setUp(() {
    client = _Client();
    auth = _Auth();
    session = _Session();
    log = [];
    when(() => client.auth).thenReturn(auth);
    when(() => auth.currentUser).thenReturn(user);
    when(() => auth.currentSession).thenReturn(session);
    // Each credential read is logged, so the guard's order is visible.
    when(() => session.accessToken).thenAnswer((_) {
      log.add('credentials');
      return 'synthetic-access';
    });
    when(() => session.expiresAt).thenReturn(
      DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/
          1000,
    );
    ApiVerification.requestToken = () async => 'fixture';
  });
  tearDown(() => ApiVerification.requestToken = null);

  /// Every guard call follows a credential read for that same attempt.
  void expectGuardAfterCredentials() {
    var prepared = false;
    for (final entry in log) {
      switch (entry) {
        case 'credentials':
          prepared = true;
        case 'guard':
          expect(prepared, isTrue, reason: 'guard ran before credentials');
        case 'dispatch':
          prepared = false;
      }
    }
  }

  /// Answers the first POST with a verification challenge, then 200.
  ApiClient challenged(List<String> log) {
    var requests = 0;
    final api = ApiClient(
      baseUrl: 'https://example.test',
      authClient: client,
      httpClient: MockClient((request) async {
        log.add('dispatch');
        return requests++ == 0
            ? http.Response(
                '{}',
                403,
                headers: {'x-abuse-challenge': 'turnstile'},
              )
            : http.Response('{}', 200);
      }),
    );
    addTearDown(api.dispose);
    return api;
  }

  test('beforeDispatch runs before every dispatch, replays included', () async {
    final api = challenged(log);
    await api.postJsonGuarded(
      '/answer',
      const {},
      beforeDispatch: () async => log.add('guard'),
    );
    expect(log.where((e) => e != 'credentials').toList(), [
      'guard',
      'dispatch',
      'guard',
      'dispatch',
    ]);
    expectGuardAfterCredentials();
  });

  test('a guard that throws before the replay sends nothing more', () async {
    final api = challenged(log);
    var calls = 0;
    await expectLater(
      api.postJsonGuarded(
        '/answer',
        const {},
        beforeDispatch: () async {
          log.add('guard');
          if (++calls > 1) throw StateError('signer no longer trusted');
        },
      ),
      throwsA(isA<ApiException>()),
    );
    expect(log.where((e) => e != 'credentials').toList(), [
      'guard',
      'dispatch',
      'guard',
    ]);
    expectGuardAfterCredentials();
  });

  test('the session-refresh replay runs the guard again', () async {
    when(
      () => auth.refreshSession(),
    ).thenAnswer((_) async => AuthResponse(session: session, user: user));
    var requests = 0;
    final api = ApiClient(
      baseUrl: 'https://example.test',
      authClient: client,
      httpClient: MockClient((request) async {
        log.add('dispatch');
        return http.Response('{}', requests++ == 0 ? 401 : 200);
      }),
    );
    addTearDown(api.dispose);
    var calls = 0;
    await expectLater(
      api.postJsonGuarded(
        '/answer',
        const {},
        beforeDispatch: () async {
          log.add('guard');
          if (++calls > 1) throw StateError('signer no longer trusted');
        },
      ),
      throwsA(isA<ApiException>()),
    );
    expect(log.where((e) => e != 'credentials').toList(), [
      'guard',
      'dispatch',
      'guard',
    ]);
    verify(() => auth.refreshSession()).called(1);
    expectGuardAfterCredentials();
  });
}
