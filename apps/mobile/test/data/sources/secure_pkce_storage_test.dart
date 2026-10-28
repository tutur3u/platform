import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/data/sources/secure_pkce_storage.dart';
import 'package:mobile/data/sources/secure_storage.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class _MockFlutterSecureStorage extends Mock implements FlutterSecureStorage {}

const _verifierKey = 'supabase.auth.token-code-verifier';

void main() {
  late Map<String, String> secureValues;
  late FlutterSecureStorage secureStorage;
  late SecurePkceStorage storage;

  Future<SharedPreferences> prefs() => SharedPreferences.getInstance();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    secureValues = {};
    secureStorage = _MockFlutterSecureStorage();
    when(() => secureStorage.read(key: any(named: 'key'))).thenAnswer(
      (call) async => secureValues[call.namedArguments[#key] as String],
    );
    when(
      () => secureStorage.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((call) async {
      secureValues[call.namedArguments[#key] as String] =
          call.namedArguments[#value] as String;
    });
    when(() => secureStorage.delete(key: any(named: 'key'))).thenAnswer((
      call,
    ) async {
      secureValues.remove(call.namedArguments[#key] as String);
    });
    storage = SecurePkceStorage(storage: secureStorage);
  });

  test('stores the verifier in secure storage, never in preferences', () async {
    await storage.setItem(key: _verifierKey, value: 'verifier');

    expect(secureValues, {_verifierKey: 'verifier'});
    expect((await prefs()).containsKey(_verifierKey), isFalse);
    expect(await storage.getItem(key: _verifierKey), 'verifier');

    await storage.removeItem(key: _verifierKey);
    expect(secureValues, isEmpty);
    expect(await storage.getItem(key: _verifierKey), isNull);
  });

  test('honors a verifier left by an older version, then deletes it', () async {
    SharedPreferences.setMockInitialValues({_verifierKey: 'old-verifier'});

    expect(await storage.getItem(key: _verifierKey), 'old-verifier');

    expect((await prefs()).containsKey(_verifierKey), isFalse);
    expect(await storage.getItem(key: _verifierKey), isNull);
  });

  test('prefers the secure verifier and still clears the old copy', () async {
    SharedPreferences.setMockInitialValues({_verifierKey: 'old-verifier'});
    secureValues[_verifierKey] = 'secure-verifier';

    expect(await storage.getItem(key: _verifierKey), 'secure-verifier');
    expect((await prefs()).containsKey(_verifierKey), isFalse);
  });

  test('clears the old copy when a new verifier is written', () async {
    SharedPreferences.setMockInitialValues({_verifierKey: 'old-verifier'});

    await storage.setItem(key: _verifierKey, value: 'new-verifier');

    expect((await prefs()).containsKey(_verifierKey), isFalse);
    expect(secureValues[_verifierKey], 'new-verifier');
  });

  test('wires both session and PKCE storage into supabase auth', () {
    final options = buildAuthClientOptions();

    expect(options.localStorage, isA<SupabaseSecureStorage>());
    expect(options.pkceAsyncStorage, isA<SecurePkceStorage>());
  });

  test('OAuth round trip keeps the verifier in secure storage', () async {
    Map<String, dynamic>? tokenBody;
    final auth = GoTrueClient(
      url: 'https://auth.example.test/auth/v1',
      httpClient: MockClient((request) async {
        expect(request.url.path, '/auth/v1/token');
        expect(request.url.queryParameters['grant_type'], 'pkce');
        tokenBody = jsonDecode(request.body) as Map<String, dynamic>;
        return http.Response(
          jsonEncode({
            'access_token': 'access',
            'refresh_token': 'refresh',
            'token_type': 'bearer',
            'expires_in': 3600,
            'user': {
              'id': 'user-1',
              'aud': 'authenticated',
              'app_metadata': <String, dynamic>{},
              'user_metadata': <String, dynamic>{},
              'created_at': '2026-10-28T00:00:00Z',
            },
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
      asyncStorage: storage,
    );

    final launch = await auth.getOAuthSignInUrl(
      provider: OAuthProvider.google,
      redirectTo: 'com.tuturuuu.app.mobile://login-callback',
    );

    final stored = secureValues[_verifierKey]!;
    final verifier = stored.split('/').first;
    expect(
      (await prefs()).getKeys(),
      isEmpty,
      reason: 'the verifier must not touch SharedPreferences',
    );
    final params = Uri.parse(launch.url).queryParameters;
    expect(params['code_challenge_method'], 's256');
    expect(
      params['code_challenge'],
      base64UrlEncode(
        sha256.convert(ascii.encode(verifier)).bytes,
      ).replaceAll('=', ''),
    );

    final result = await auth.exchangeCodeForSession('auth-code');

    expect(result.session.refreshToken, 'refresh');
    expect(tokenBody, {'auth_code': 'auth-code', 'code_verifier': verifier});
    expect(secureValues, isEmpty, reason: 'verifier is single use');
  });
}
