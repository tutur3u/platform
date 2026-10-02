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
    when(() => session.accessToken).thenReturn('synthetic-session');
    when(() => session.expiresAt).thenReturn(
      DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/
          1000,
    );
  });
  tearDown(() => ApiVerification.requestToken = null);

  ApiClient api(http.Client transport) => ApiClient(
    baseUrl: 'https://example.test',
    authClient: client,
    httpClient: transport,
  );

  test(
    'bulk GETs across clients are sequential and paced; mutations are unmarked',
    () async {
      final started = <DateTime>[];
      final paths = <String>[];
      final transport = MockClient((request) async {
        paths.add(request.url.path);
        if (request.method == 'GET') {
          expect(request.headers['x-tuturuuu-offline-download'], '1');
          started.add(DateTime.now());
        } else {
          expect(request.headers['x-tuturuuu-offline-download'], isNull);
        }
        return http.Response('{}', 200);
      });
      final first = api(transport);
      final second = api(transport);
      await ApiClient.offlinePreparation(() async {
        await Future.wait([
          first.getJson('/first'),
          second.getJson('/second'),
          first.getJson('/third'),
        ]);
        await first.postJson('/write', {});
      });
      expect(paths, ['/first', '/second', '/third', '/write']);
      for (var i = 1; i < started.length; i++) {
        expect(
          started[i].difference(started[i - 1]).inMilliseconds,
          greaterThanOrEqualTo(740),
        );
      }
      first.dispose();
      second.dispose();
    },
  );

  test(
    'regular background refresh is paced without bulk verification marker',
    () async {
      final started = <DateTime>[];
      final instance = api(
        MockClient((request) async {
          expect(request.headers['x-tuturuuu-offline-download'], isNull);
          started.add(DateTime.now());
          return http.Response('{}', 200);
        }),
      );
      await ApiClient.offlinePreparation(
        () async {
          await Future.wait([
            instance.getJson('/first'),
            instance.getJson('/second'),
          ]);
        },
        allowChallenge: false,
        markBulk: false,
      );
      expect(
        started.last.difference(started.first).inMilliseconds,
        greaterThanOrEqualTo(740),
      );
      instance.dispose();
    },
  );

  test(
    'silent automatic downloads preserve explicit verification-required errors',
    () async {
      var prompts = 0;
      var requests = 0;
      ApiVerification.requestToken = () async {
        prompts++;
        return 'unused';
      };
      final instance = api(
        MockClient((request) async {
          requests++;
          return http.Response(
            '{"code":"ABUSE_CHALLENGE_REQUIRED"}',
            403,
            headers: {'x-abuse-challenge': 'turnstile'},
          );
        }),
      );
      await expectLater(
        ApiClient.offlinePreparation(
          () => instance.getJson('/products'),
          allowChallenge: false,
        ),
        throwsA(
          isA<ApiException>().having(
            (error) => error.isVerificationRequired,
            'verification required',
            isTrue,
          ),
        ),
      );
      expect(prompts, 0);
      expect(requests, 1);
      instance.dispose();
    },
  );

  test(
    'explicit download verifies once and leaves ordinary requests unmarked',
    () async {
      var prompts = 0;
      var requests = 0;
      ApiVerification.requestToken = () async {
        prompts++;
        return 'one-use';
      };
      final instance = api(
        MockClient((request) async {
          requests++;
          if (requests == 1) {
            return http.Response(
              '{}',
              403,
              headers: {'x-abuse-challenge': 'turnstile'},
            );
          }
          expect(
            request.headers['x-tuturuuu-turnstile-token'],
            requests == 2 ? 'one-use' : isNull,
          );
          expect(
            request.headers['x-tuturuuu-offline-download'],
            requests == 3 ? isNull : '1',
          );
          return http.Response('{}', 200);
        }),
      );
      await ApiClient.offlinePreparation(() => instance.getJson('/products'));
      await instance.getJson('/foreground');
      expect(prompts, 1);
      expect(requests, 3);
      expect(ApiVerification.token, isNull);
      instance.dispose();
    },
  );

  test('429 exposes cooldown without retries', () async {
    var requests = 0;
    final instance = api(
      MockClient((request) async {
        requests++;
        return http.Response('{}', 429, headers: {'retry-after': '30'});
      }),
    );
    await expectLater(
      ApiClient.offlinePreparation(() => instance.getJson('/products')),
      throwsA(
        isA<ApiException>().having((error) => error.retryAfter, 'cooldown', 30),
      ),
    );
    expect(requests, 1);
    instance.dispose();
  });

  test(
    'scope switch blocks queued pages and discards an in-flight result',
    () async {
      var active = true;
      var requests = 0;
      final response = Completer<http.Response>();
      final started = Completer<void>();
      final instance = api(
        MockClient((request) {
          requests++;
          started.complete();
          return response.future;
        }),
      );
      final first = ApiClient.offlinePreparation(
        () => instance.getJson('/first'),
        shouldContinue: () => active,
      );
      final firstCheck = expectLater(first, throwsA(isA<ApiException>()));
      await started.future;
      final second = ApiClient.offlinePreparation(
        () => instance.getJson('/second'),
        shouldContinue: () => active,
      );
      final secondCheck = expectLater(second, throwsA(isA<ApiException>()));
      active = false;
      response.complete(http.Response('{}', 200));
      await Future.wait([firstCheck, secondCheck]);
      expect(requests, 1);
      instance.dispose();
    },
  );
}
