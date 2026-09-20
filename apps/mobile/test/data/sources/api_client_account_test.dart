import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/data/sources/api_client.dart';
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
