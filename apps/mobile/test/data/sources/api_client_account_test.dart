import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/data/repositories/calendar_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/data/sources/api_verification.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class _Client extends Mock implements SupabaseClient {}

class _Auth extends Mock implements GoTrueClient {}

class _Session extends Mock implements Session {}

void main() {
  late _Client client;
  late _Auth auth;
  late _Session session;
  const user = User(
    id: 'user-a',
    appMetadata: {},
    userMetadata: {},
    aud: 'authenticated',
    createdAt: '2026-01-01',
  );
  setUp(() {
    client = _Client();
    auth = _Auth();
    session = _Session();
    when(() => client.auth).thenReturn(auth);
    when(() => auth.currentUser).thenReturn(user);
    when(() => auth.currentSession).thenReturn(session);
    when(() => session.accessToken).thenReturn('access-a');
    when(() => session.expiresAt).thenReturn(
      DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/
          1000,
    );
  });
  tearDown(() => ApiVerification.requestToken = null);
  for (final token in <String?>[null, 'one-use']) {
    test('explicit challenge retries at most once: $token', () async {
      var requests = 0;
      var prompts = 0;
      ApiVerification.requestToken = () async {
        prompts++;
        return token;
      };
      final api = ApiClient(
        baseUrl: 'https://example.test',
        authClient: client,
        httpClient: MockClient((request) async {
          requests++;
          expect(
            request.headers['x-tuturuuu-turnstile-token'],
            requests == 2 ? token : null,
          );
          return http.Response(
            '{}',
            403,
            headers: {'x-abuse-challenge': 'turnstile'},
          );
        }),
      );
      await expectLater(
        api.postJson('/tasks', {}),
        throwsA(isA<ApiException>()),
      );
      expect(prompts, 1);
      expect(requests, token == null ? 1 : 2);
      expect(ApiVerification.token, isNull);
      api.dispose();
    });
  }
  test(
    'permission denial never opens verification and keeps the useful message',
    () async {
      var prompts = 0;
      ApiVerification.requestToken = () async {
        prompts++;
        return 'unused';
      };
      final api = ApiClient(
        baseUrl: 'https://example.test',
        authClient: client,
        httpClient: MockClient(
          (_) async => http.Response(
            '{"error":"Forbidden","message":"This workspace is read only"}',
            403,
          ),
        ),
      );
      await expectLater(
        api.postJson('/tasks', {}),
        throwsA(
          isA<ApiException>().having(
            (e) => e.message,
            'message',
            'This workspace is read only',
          ),
        ),
      );
      expect(prompts, 0);
      api.dispose();
    },
  );
  test(
    'account switching during verification cannot replay a mutation',
    () async {
      var requests = 0;
      ApiVerification.requestToken = () async {
        when(() => auth.currentUser).thenReturn(null);
        return 'one-use';
      };
      final api = ApiClient(
        baseUrl: 'https://example.test',
        authClient: client,
        httpClient: MockClient((_) async {
          requests++;
          return http.Response(
            '{}',
            403,
            headers: {'x-abuse-challenge': 'turnstile'},
          );
        }),
      );
      await expectLater(
        api.postJson('/tasks', {}),
        throwsA(isA<ApiException>()),
      );
      expect(requests, 1);
      api.dispose();
    },
  );
  test('verified mutation retries with one isolated token', () async {
    var requests = 0;
    ApiVerification.requestToken = () async => 'one-use';
    final api = ApiClient(
      baseUrl: 'https://example.test',
      authClient: client,
      httpClient: MockClient((request) async {
        requests++;
        expect(request.body, '{"name":"Test"}');
        if (requests == 1) {
          return http.Response(
            '{}',
            403,
            headers: {'x-abuse-challenge': 'turnstile'},
          );
        }
        expect(request.headers['x-tuturuuu-turnstile-token'], 'one-use');
        return http.Response('{"id":"created"}', 201);
      }),
    );
    expect(await api.postJson('/tasks', {'name': 'Test'}), {'id': 'created'});
    expect(requests, 2);
    expect(ApiVerification.token, isNull);
    api.dispose();
  });
  test(
    'streaming chat retries a challenge once and returns the response stream',
    () async {
      var requests = 0;
      ApiVerification.requestToken = () async => 'stream-token';
      final api = ApiClient(
        baseUrl: 'https://example.test',
        authClient: client,
        httpClient: MockClient((request) async {
          requests++;
          if (requests == 1) {
            return http.Response(
              '{}',
              403,
              headers: {'x-abuse-challenge': 'turnstile'},
            );
          }
          expect(request.headers['x-tuturuuu-turnstile-token'], 'stream-token');
          expect(request.body, '{"content":"Hello"}');
          return http.Response('data: reply', 200);
        }),
      );
      final response = await api.sendJsonStream('POST', '/chat', {
        'content': 'Hello',
      });
      expect(await response.stream.bytesToString(), 'data: reply');
      expect(requests, 2);
      expect(ApiVerification.token, isNull);
      api.dispose();
    },
  );

  test('Calendar deletion satisfies the authenticated JSON gateway', () async {
    var requests = 0;
    final httpClient = MockClient((request) async {
      requests++;
      expect(request.method, 'DELETE');
      expect(request.url.path, '/api/v1/workspaces/ws/calendar/events/event');
      expect(request.headers['Authorization'], 'Bearer access-a');
      expect(request.headers['content-type'], startsWith('application/json'));
      expect(request.body, '{}');
      return http.Response('', 204);
    });
    final repository = CalendarRepository(
      apiClient: ApiClient(
        baseUrl: 'https://example.test',
        httpClient: httpClient,
        authClient: client,
      ),
    );
    await repository.deleteEvent('ws', 'event');
    expect(requests, 1);
    repository.dispose();
  });
  test('never retries a rejected mutation under a different account', () async {
    var requests = 0;
    final httpClient = MockClient((request) async {
      requests++;
      expect(request.headers['Authorization'], 'Bearer access-a');
      when(() => auth.currentUser).thenReturn(null);
      return http.Response('{}', 401);
    });
    final api = ApiClient(
      baseUrl: 'https://example.test',
      httpClient: httpClient,
      authClient: client,
    );
    await expectLater(
      api.deleteJson('/api/v1/users/sessions'),
      throwsA(isA<ApiException>()),
    );
    expect(requests, 1);
    verifyNever(() => auth.refreshSession());
    httpClient.close();
  });
  test('does not return private data after the account changes', () async {
    final httpClient = MockClient((_) async {
      when(() => auth.currentUser).thenReturn(null);
      return http.Response('{"private":"user-a"}', 200);
    });
    final api = ApiClient(
      baseUrl: 'https://example.test',
      httpClient: httpClient,
      authClient: client,
    );
    await expectLater(api.getJson('/private'), throwsA(isA<ApiException>()));
    httpClient.close();
  });
}
