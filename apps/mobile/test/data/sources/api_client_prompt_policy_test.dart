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

/// Plain reads (Home, lists, navigation) never open the interactive
/// security check; writes and explicit offline downloads still may. Every
/// path still sends the token it gets, so the server keeps deciding.
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

  ApiClient challengedOnce(List<String?> sentTokens) {
    var requests = 0;
    return ApiClient(
      baseUrl: 'https://example.test',
      authClient: client,
      httpClient: MockClient((request) async {
        requests++;
        sentTokens.add(request.headers['x-tuturuuu-turnstile-token']);
        if (requests == 1) {
          return http.Response(
            '{}',
            403,
            headers: {'x-abuse-challenge': 'turnstile'},
          );
        }
        return http.Response('{"ok":true}', 200);
      }),
    );
  }

  test('a read step-up asks for a background token only', () async {
    final prompts = <bool>[];
    ApiVerification.requestToken = () async {
      prompts.add(ApiVerification.allowsPrompt);
      return 'background-token';
    };
    final sent = <String?>[];
    final api = challengedOnce(sent);
    expect(await api.getJson('/api/v1/users/me/tasks'), {'ok': true});
    expect(prompts, [false]);
    // The background token still goes to the server for verification.
    expect(sent, [null, 'background-token']);
    expect(ApiVerification.allowsPrompt, isTrue);
    api.dispose();
  });

  test('a read without a background token surfaces the step-up', () async {
    ApiVerification.requestToken = () async {
      // The router returns null when only an interactive check would work.
      return ApiVerification.allowsPrompt ? 'interactive-token' : null;
    };
    final sent = <String?>[];
    final api = challengedOnce(sent);
    await expectLater(
      api.getJson('/api/v1/users/me/tasks'),
      throwsA(
        isA<ApiException>().having(
          (error) => error.isVerificationRequired,
          'isVerificationRequired',
          isTrue,
        ),
      ),
    );
    expect(sent, [null]);
    api.dispose();
  });

  test('a write may show the interactive check', () async {
    final prompts = <bool>[];
    ApiVerification.requestToken = () async {
      prompts.add(ApiVerification.allowsPrompt);
      return 'one-use';
    };
    final sent = <String?>[];
    final api = challengedOnce(sent);
    expect(await api.postJson('/tasks', {'name': 'Test'}), {'ok': true});
    expect(prompts, [true]);
    expect(sent.last, 'one-use');
    api.dispose();
  });

  test('an explicit offline download may show the interactive check', () async {
    final prompts = <bool>[];
    ApiVerification.requestToken = () async {
      prompts.add(ApiVerification.allowsPrompt);
      return 'download-token';
    };
    final sent = <String?>[];
    final api = challengedOnce(sent);
    final result = await ApiClient.offlinePreparation(
      () => api.getJson('/api/v1/users/me/tasks'),
    );
    expect(result, {'ok': true});
    expect(prompts, [true]);
    expect(sent.last, 'download-token');
    api.dispose();
  });

  test('integrity proof preparation never spends the step-up token', () async {
    ApiVerification.requestToken = () async => 'one-use';
    final challengeTokens = <String?>[];
    final settingsTokens = <String?>[];
    final api = ApiClient(
      baseUrl: 'https://example.test',
      authClient: client,
      httpClient: MockClient((request) async {
        final token = request.headers['x-tuturuuu-turnstile-token'];
        if (request.url.path == '/api/v1/native-integrity/challenge') {
          challengeTokens.add(token);
          return http.Response('{"mode":"off"}', 200);
        }
        settingsTokens.add(token);
        if (settingsTokens.length == 1) {
          return http.Response(
            '{}',
            403,
            headers: {'x-abuse-challenge': 'turnstile'},
          );
        }
        return http.Response('{"timezone":"UTC"}', 200);
      }),
    );
    expect(
      await api.patchJson('/api/v1/users/calendar-settings', {
        'timezone': 'UTC',
      }),
      {'timezone': 'UTC'},
    );
    // One proof preparation per attempt, neither carrying the token; only
    // the replayed protected request does.
    expect(challengeTokens, [null, null]);
    expect(settingsTokens, [null, 'one-use']);
    api.dispose();
  });

  group('ApiVerification.promptsFor', () {
    test('reads stay quiet unless they are an offline download', () {
      expect(ApiVerification.promptsFor('GET', bulkRead: false), isFalse);
      expect(ApiVerification.promptsFor('head', bulkRead: false), isFalse);
      expect(ApiVerification.promptsFor('GET', bulkRead: true), isTrue);
    });

    test('writes and unknown methods keep the interactive fallback', () {
      for (final method in ['POST', 'PUT', 'PATCH', 'DELETE', null]) {
        expect(
          ApiVerification.promptsFor(method, bulkRead: false),
          isTrue,
          reason: '$method',
        );
      }
    });

    test('request scopes the prompt flag to one ask', () async {
      bool? seen;
      ApiVerification.requestToken = () async {
        seen = ApiVerification.allowsPrompt;
        return 'token';
      };
      expect(await ApiVerification.request(allowPrompt: false), 'token');
      expect(seen, isFalse);
      expect(ApiVerification.allowsPrompt, isTrue);
      ApiVerification.requestToken = null;
      expect(await ApiVerification.request(allowPrompt: true), isNull);
    });
  });
}
