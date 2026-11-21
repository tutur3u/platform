import 'dart:async';
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/data/sources/api_verification.dart';
import 'package:mobile/data/sources/mobile_client_credential.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class _Client extends Mock implements SupabaseClient {}

class _Auth extends Mock implements GoTrueClient {}

class _Session extends Mock implements Session {}

class _Storage extends Mock implements FlutterSecureStorage {}

String _jwt(Map<String, Object?> claims) {
  String part(Object value) =>
      base64Url.encode(utf8.encode(jsonEncode(value))).replaceAll('=', '');
  return '${part({'alg': 'none'})}.${part(claims)}.sig';
}

void main() {
  const user = User(
    id: 'user-a',
    appMetadata: {},
    userMetadata: {},
    aud: 'authenticated',
    createdAt: '2026-01-01',
  );
  final accessToken = _jwt({'sub': 'user-a', 'session_id': 'session-1'});
  late _Client client;
  late _Auth auth;
  late MobileClientCredentials original;
  late List<http.Request> requests;
  late int mints;
  late int prompts;
  Completer<void>? slow;
  final stepUp = http.Response(
    '{"code":"ABUSE_CHALLENGE_REQUIRED"}',
    403,
    headers: {'x-abuse-challenge': 'turnstile'},
  );

  setUpAll(() => original = MobileClientCredentials.instance);
  tearDownAll(() => MobileClientCredentials.instance = original);

  setUp(() {
    client = _Client();
    auth = _Auth();
    final session = _Session();
    final storage = _Storage();
    final values = <String, String>{};
    when(() => client.auth).thenReturn(auth);
    when(() => auth.currentUser).thenReturn(user);
    when(() => auth.currentSession).thenReturn(session);
    when(() => session.accessToken).thenReturn(accessToken);
    when(() => session.expiresAt).thenReturn(
      DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/
          1000,
    );
    when(
      () => storage.read(key: any(named: 'key')),
    ).thenAnswer((call) async => values[call.namedArguments[#key]]);
    when(
      () => storage.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((call) async {
      values[call.namedArguments[#key] as String] =
          call.namedArguments[#value] as String;
    });
    when(() => storage.delete(key: any(named: 'key'))).thenAnswer((call) async {
      values.remove(call.namedArguments[#key]);
    });
    MobileClientCredentials.instance = MobileClientCredentials(
      storage: storage,
      turnstile: (_, _) async => 'captcha',
    );
    requests = [];
    mints = 0;
    prompts = 0;
    slow = null;
    ApiVerification.requestToken = () async {
      prompts++;
      return null;
    };
  });
  tearDown(() => ApiVerification.requestToken = null);

  // A credential issued at sign-in, which the server may later refuse.
  Future<void> signedIn() => MobileClientCredentials.instance.storeIssued(
    userId: 'user-a',
    accessToken: accessToken,
    mobileClient: {
      'token': 'login',
      'expires_at': DateTime.now()
          .add(const Duration(hours: 24))
          .toUtc()
          .toIso8601String(),
    },
  );

  ApiClient api(http.Response Function(http.Request request) route) {
    final client0 = ApiClient(
      baseUrl: 'https://tuturuuu.com',
      authClient: client,
      httpClient: MockClient((request) async {
        if (request.url.path == mobileClientCredentialEndpoint) {
          expect(request.headers['origin'], isNull);
          expect(request.headers['authorization'], 'Bearer $accessToken');
          expect(jsonDecode(request.body), {'captchaToken': 'captcha'});
          mints++;
          return http.Response(
            jsonEncode({
              'mobile_client': {
                'token': 'credential-$mints',
                'expires_at': DateTime.now()
                    .add(const Duration(hours: 24))
                    .toUtc()
                    .toIso8601String(),
              },
            }),
            200,
          );
        }
        requests.add(request);
        await slow?.future;
        return route(request);
      }),
    );
    addTearDown(client0.dispose);
    return client0;
  }

  test('a mutation mints in the background; later requests send it', () async {
    final client0 = api((_) => http.Response('{}', 200));
    await client0.getJson('/api/v1/items');
    expect(requests.single.headers[mobileClientHeader], isNull);
    expect(mints, 0);

    await client0.postJson('/api/v1/items', const {});
    expect(requests.last.headers[mobileClientHeader], isNull);
    await pumpEventQueue();
    expect(mints, 1);
    await client0.postJson('/api/v1/items', const {});
    expect(requests.last.headers[mobileClientHeader], 'credential-1');
    expect(requests.last.followRedirects, isFalse);
    // The server ignores it on reads, so reads never carry it.
    await client0.getJson('/api/v1/items');
    expect(requests.last.headers[mobileClientHeader], isNull);
    expect(mints, 1);
  });

  test(
    'a credential stored after the request left is replayed, not dropped',
    () async {
      var challenged = false;
      final client0 = api((request) {
        if (request.headers[mobileClientHeader] != null) {
          return http.Response('{"ok":true}', 200);
        }
        challenged = true;
        return stepUp;
      });
      // The background mint finishes while the first response is in flight.
      slow = Completer<void>();
      final result = client0.postJson('/api/v1/items', const {});
      await pumpEventQueue();
      expect(mints, 1);
      expect(challenged, isFalse);
      slow!.complete();
      expect(await result, {'ok': true});
      expect(mints, 1);
      expect(requests.map((r) => r.headers[mobileClientHeader]), [
        null,
        'credential-1',
      ]);
      // The stored credential survives for the next mutation.
      await client0.postJson('/api/v1/items', const {});
      expect(requests.last.headers[mobileClientHeader], 'credential-1');
      expect(mints, 1);
    },
  );

  test('a step-up without a credential awaits the mint and replays', () async {
    final client0 = api(
      (request) => request.headers[mobileClientHeader] == 'credential-1'
          ? http.Response('{"ok":true}', 200)
          : stepUp,
    );
    expect(await client0.postJson('/api/v1/items', const {}), {'ok': true});
    expect(mints, 1);
    expect(requests.length, 2);
    expect(prompts, 0);
  });

  test('a step-up re-mints once and replays', () async {
    await signedIn();
    final client0 = api(
      (request) => request.headers[mobileClientHeader] == 'credential-1'
          ? http.Response('{"ok":true}', 200)
          : stepUp,
    );
    expect(await client0.postJson('/api/v1/items', const {}), {'ok': true});
    expect(mints, 1);
    expect(requests.map((r) => r.headers[mobileClientHeader]), [
      'login',
      'credential-1',
    ]);
    expect(prompts, 0);
  });

  test('a persistent step-up never loops through mints', () async {
    await signedIn();
    final client0 = api((_) => stepUp);
    await expectLater(
      client0.postJson('/api/v1/items', const {}),
      throwsA(isA<ApiException>()),
    );
    await expectLater(
      client0.postJson('/api/v1/items', const {}),
      throwsA(isA<ApiException>()),
    );
    // One re-mint, then the re-mint interval holds and the dialog decides.
    expect(mints, 1);
    expect(requests.length, 3);
    expect(prompts, 2);
  });

  test('acknowledged mutations replay once after a step-up', () async {
    await signedIn();
    final client0 = api(
      (request) => request.headers[mobileClientHeader] == 'credential-1'
          ? http.Response('{}', 200)
          : stepUp,
    );
    expect(
      await client0.patchJsonAcknowledged(
        '/api/v1/items',
        const {},
        actorId: 'user-a',
        isCurrent: () => true,
      ),
      isEmpty,
    );
    expect(requests.length, 2);
    expect(prompts, 0);
  });

  test('acknowledged generic 403s are not replayed', () async {
    await signedIn();
    final client0 = api((_) => http.Response('{}', 403));
    await expectLater(
      client0.patchJsonAcknowledged(
        '/api/v1/items',
        const {},
        actorId: 'user-a',
        isCurrent: () => true,
      ),
      throwsA(isA<ApiException>()),
    );
    expect(requests.length, 1);
    expect(mints, 0);
  });
}
