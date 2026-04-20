import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/constants/storage_keys.dart';
import 'package:mobile/data/repositories/multi_account_storage_service.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/data/sources/google_identity_client.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class _MockSupabaseClient extends Mock implements SupabaseClient {}

class _MockGoTrueClient extends Mock implements GoTrueClient {}

class _MockSession extends Mock implements Session {}

class _MockFlutterSecureStorage extends Mock implements FlutterSecureStorage {}

class _MockApiClient extends Mock implements ApiClient {}

class _MockGoogleIdentityClient extends Mock implements GoogleIdentityClient {}

User _user(String id) => User.fromJson({
  'id': id,
  'aud': 'authenticated',
  'role': 'authenticated',
  'email': '$id@example.com',
  'app_metadata': const <String, dynamic>{},
  'user_metadata': const <String, dynamic>{},
  'created_at': '2024-01-01T00:00:00.000000Z',
})!;

Map<String, dynamic> _storedAccount({
  required String id,
  required int lastActiveAt,
  String refreshToken = 'token',
}) {
  return {
    'id': id,
    'refreshToken': refreshToken,
    'lastActiveAt': lastActiveAt,
    'addedAt': lastActiveAt,
    'sessionJson': null,
    'email': '$id@example.com',
    'displayName': null,
    'avatarUrl': null,
    'lastWorkspaceId': null,
  };
}

void main() {
  late SupabaseClient supabaseClient;
  late GoTrueClient goTrueClient;
  late Session session;
  late FlutterSecureStorage secureStorage;
  late ApiClient apiClient;
  late GoogleIdentityClient googleIdentityClient;
  late MultiAccountStorageService service;
  late Map<String, String> secureStorageValues;

  setUp(() {
    supabaseClient = _MockSupabaseClient();
    goTrueClient = _MockGoTrueClient();
    session = _MockSession();
    secureStorage = _MockFlutterSecureStorage();
    apiClient = _MockApiClient();
    googleIdentityClient = _MockGoogleIdentityClient();
    secureStorageValues = <String, String>{};

    when(() => supabaseClient.auth).thenReturn(goTrueClient);
    when(() => goTrueClient.currentSession).thenReturn(session);
    when(() => goTrueClient.currentUser).thenReturn(_user('current-user'));
    when(() => session.refreshToken).thenReturn('session-refresh-token');
    when(() => goTrueClient.signOut()).thenAnswer((_) async {});
    when(() => googleIdentityClient.signOut()).thenAnswer((_) async {});
    when(
      () => apiClient.getJson(any()),
    ).thenThrow(const ApiException(message: 'not needed', statusCode: 500));

    when(
      () => secureStorage.read(key: any(named: 'key')),
    ).thenAnswer(
      (invocation) async =>
          secureStorageValues[invocation.namedArguments[#key] as String],
    );
    when(
      () => secureStorage.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((invocation) async {
      final key = invocation.namedArguments[#key] as String;
      final value = invocation.namedArguments[#value] as String?;
      if (value == null) {
        secureStorageValues.remove(key);
      } else {
        secureStorageValues[key] = value;
      }
    });
    when(
      () => secureStorage.delete(key: any(named: 'key')),
    ).thenAnswer((invocation) async {
      secureStorageValues.remove(invocation.namedArguments[#key] as String);
    });

    service = MultiAccountStorageService(
      supabaseClient: supabaseClient,
      secureStorage: secureStorage,
      apiClient: apiClient,
      googleIdentityClient: googleIdentityClient,
    );
  });

  test(
    'syncCurrentSessionToMultiAccountStore keeps '
    'active account valid after trim',
    () async {
      secureStorageValues[StorageKeys.multiAccountStore] = jsonEncode({
        'version': 1,
        'activeAccountId': 'evicted-active',
        'accounts': [
          _storedAccount(id: 'evicted-active', lastActiveAt: 10),
          _storedAccount(id: 'user-a', lastActiveAt: 50),
          _storedAccount(id: 'user-b', lastActiveAt: 40),
          _storedAccount(id: 'user-c', lastActiveAt: 30),
          _storedAccount(id: 'user-d', lastActiveAt: 20),
        ],
      });

      await service.syncCurrentSessionToMultiAccountStore(
        switchImmediately: false,
      );

      final raw = secureStorageValues[StorageKeys.multiAccountStore];
      expect(raw, isNotNull);
      final decoded = jsonDecode(raw!) as Map<String, dynamic>;
      final accounts = decoded['accounts'] as List<dynamic>;
      final activeAccountId = decoded['activeAccountId'] as String?;

      expect(accounts.length, 5);
      final hasActiveAccount = accounts.whereType<Map<String, dynamic>>().any(
        (account) => account['id'] == activeAccountId,
      );
      expect(hasActiveAccount, isTrue);
    },
  );

  test(
    'removeStoredAccount signs out Google when removing final account',
    () async {
      secureStorageValues[StorageKeys.multiAccountStore] = jsonEncode({
        'version': 1,
        'activeAccountId': 'only-user',
        'accounts': [
          _storedAccount(id: 'only-user', lastActiveAt: 100, refreshToken: ''),
        ],
      });

      when(() => googleIdentityClient.signOut()).thenThrow(Exception('ignore'));

      final result = await service.removeStoredAccount('only-user');

      expect(result.success, isTrue);
      expect(result.switched, isFalse);
      expect(
        secureStorageValues.containsKey(StorageKeys.multiAccountStore),
        isFalse,
      );
      verify(() => goTrueClient.signOut()).called(1);
      verify(() => googleIdentityClient.signOut()).called(1);
    },
  );

  test(
    'signOutAllAccounts clears store after best-effort revocation loop',
    () async {
      secureStorageValues[StorageKeys.multiAccountStore] = jsonEncode({
        'version': 1,
        'activeAccountId': 'user-a',
        'accounts': [
          _storedAccount(id: 'user-a', lastActiveAt: 100, refreshToken: ''),
          _storedAccount(id: 'user-b', lastActiveAt: 90, refreshToken: ''),
        ],
      });

      await service.signOutAllAccounts();

      expect(
        secureStorageValues.containsKey(StorageKeys.multiAccountStore),
        isFalse,
      );
      verify(() => goTrueClient.signOut()).called(1);
      verify(() => googleIdentityClient.signOut()).called(1);
    },
  );
}
