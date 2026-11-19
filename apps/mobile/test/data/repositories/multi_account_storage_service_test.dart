import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/core/constants/storage_keys.dart';
import 'package:mobile/data/models/multi_account_store.dart';
import 'package:mobile/data/models/stored_account_switch_result.dart';
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

Map<String, dynamic> _sessionJson(
  String id, {
  bool expired = false,
  String refreshToken = 'synthetic-refresh',
}) {
  String encode(Object value) =>
      base64Url.encode(utf8.encode(jsonEncode(value))).replaceAll('=', '');
  final now = DateTime.now().millisecondsSinceEpoch ~/ 1000;
  final exp = expired ? now - 120 : now + 3600;
  final header = encode({'alg': 'HS256', 'typ': 'JWT'});
  final payload = encode({'sub': id, 'iat': now - 360, 'exp': exp});
  return {
    'access_token': '$header.$payload.signature',
    'refresh_token': refreshToken,
    'token_type': 'bearer',
    'user': _user(id).toJson(),
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
  late Future<http.Response> Function(http.Request) refreshResponse;
  late List<http.Request> refreshRequests;

  setUp(() {
    supabaseClient = _MockSupabaseClient();
    goTrueClient = _MockGoTrueClient();
    session = _MockSession();
    secureStorage = _MockFlutterSecureStorage();
    apiClient = _MockApiClient();
    googleIdentityClient = _MockGoogleIdentityClient();
    secureStorageValues = <String, String>{};
    refreshRequests = [];
    refreshResponse = (_) async => http.Response('{}', 500);
    when(
      () => supabaseClient.rest,
    ).thenReturn(PostgrestClient('https://fictional.supabase.test/rest/v1'));
    when(() => goTrueClient.headers).thenReturn({'apikey': 'synthetic-key'});

    when(() => supabaseClient.auth).thenReturn(goTrueClient);
    when(() => goTrueClient.currentSession).thenReturn(session);
    when(() => goTrueClient.currentUser).thenReturn(_user('current-user'));
    when(() => session.refreshToken).thenReturn('session-refresh-token');
    when(
      () => session.toJson(),
    ).thenReturn({'refresh_token': 'session-refresh-token'});
    when(() => goTrueClient.signOut()).thenAnswer((_) async {});
    when(() => googleIdentityClient.signOut()).thenAnswer((_) async {});
    when(
      () => apiClient.getJson(any()),
    ).thenThrow(const ApiException(message: 'not needed', statusCode: 500));

    when(() => secureStorage.read(key: any(named: 'key'))).thenAnswer(
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
    when(() => secureStorage.delete(key: any(named: 'key'))).thenAnswer((
      invocation,
    ) async {
      secureStorageValues.remove(invocation.namedArguments[#key] as String);
    });

    service = MultiAccountStorageService(
      supabaseClient: supabaseClient,
      secureStorage: secureStorage,
      apiClient: apiClient,
      googleIdentityClient: googleIdentityClient,
      refreshHttpClient: MockClient((request) {
        refreshRequests.add(request);
        return refreshResponse(request);
      }),
    );
  });

  void seedSwitch({bool expired = false, String sessionOwner = 'target'}) {
    final current = Session.fromJson(
      _sessionJson('current-user', refreshToken: 'current-live-refresh'),
    )!;
    when(() => goTrueClient.currentSession).thenReturn(current);
    secureStorageValues[StorageKeys.multiAccountStore] = jsonEncode({
      'version': 1,
      'activeAccountId': 'current-user',
      'accounts': [
        _storedAccount(id: 'current-user', lastActiveAt: 100),
        {
          ..._storedAccount(
            id: 'target',
            lastActiveAt: 90,
            refreshToken: 'synthetic-refresh',
          ),
          'sessionJson': jsonEncode(
            _sessionJson(sessionOwner, expired: expired),
          ),
          'lastWorkspaceId': 'target-workspace',
        },
      ],
    });
    when(() => goTrueClient.recoverSession(any())).thenAnswer((
      invocation,
    ) async {
      final json = invocation.positionalArguments.single as String;
      final restored = Session.fromJson(
        jsonDecode(json) as Map<String, dynamic>,
      )!;
      when(() => goTrueClient.currentSession).thenReturn(restored);
      when(() => goTrueClient.currentUser).thenReturn(restored.user);
      return AuthResponse(session: restored);
    });
  }

  MultiAccountStore readStore() => MultiAccountStore.fromJson(
    jsonDecode(secureStorageValues[StorageKeys.multiAccountStore]!)
        as Map<String, dynamic>,
  );

  test('restores a valid saved session without a network request', () async {
    seedSwitch();
    final events = <String>[];
    final result = await service.switchToStoredAccount(
      'target',
      beforeActivate: () async {
        expect(goTrueClient.currentUser!.id, 'current-user');
        events.add('cleaned');
      },
    );

    expect(result, StoredAccountSwitchResult.switched);
    expect(events, ['cleaned']);
    expect(refreshRequests, isEmpty);
    verifyNever(() => apiClient.getJson(any()));
    expect(goTrueClient.currentUser!.id, 'target');
    expect(readStore().activeAccountId, 'target');
    expect(readStore().accounts.first.lastWorkspaceId, 'target-workspace');
  });

  test(
    'isolates a rejected refresh from the currently signed-in user',
    () async {
      seedSwitch(expired: true);
      refreshResponse = (_) async =>
          http.Response('{"error_code":"refresh_token_not_found"}', 400);

      final result = await service.switchToStoredAccount(
        'target',
        beforeActivate: () async => fail('Activation must be skipped'),
      );

      expect(result, StoredAccountSwitchResult.signInRequired);
      expect(goTrueClient.currentUser!.id, 'current-user');
      expect(readStore().activeAccountId, 'current-user');
      verifyNever(() => goTrueClient.recoverSession(any()));
      verifyNever(() => goTrueClient.setSession(any()));
      expect(
        refreshRequests.single.url.toString(),
        'https://fictional.supabase.test/auth/v1/token?grant_type=refresh_token',
      );
    },
  );

  test('keeps the current account after a transient refresh failure', () async {
    seedSwitch(expired: true);
    final result = await service.switchToStoredAccount('target');

    expect(result, StoredAccountSwitchResult.failed);
    expect(goTrueClient.currentUser!.id, 'current-user');
    expect(readStore().activeAccountId, 'current-user');
    verifyNever(() => goTrueClient.recoverSession(any()));
  });

  test(
    'validates the account before activating a saved or refreshed session',
    () async {
      seedSwitch(sessionOwner: 'different-user');
      expect(
        await service.switchToStoredAccount('target'),
        StoredAccountSwitchResult.failed,
      );
      expect(refreshRequests, isEmpty);
      seedSwitch(expired: true);
      refreshResponse = (_) async =>
          http.Response(jsonEncode(_sessionJson('different-user')), 200);
      expect(
        await service.switchToStoredAccount('target'),
        StoredAccountSwitchResult.failed,
      );
      expect(goTrueClient.currentUser!.id, 'current-user');
      verifyNever(() => goTrueClient.recoverSession(any()));
    },
  );

  test(
    'saves refreshed credentials and preserves each account workspace',
    () async {
      seedSwitch(expired: true);
      await service.updateActiveAccountWorkspaceContext('current-workspace');
      refreshResponse = (_) async => http.Response(
        jsonEncode(_sessionJson('target', refreshToken: 'synthetic-rotated')),
        200,
      );

      expect(
        await service.switchToStoredAccount('target'),
        StoredAccountSwitchResult.switched,
      );
      expect(readStore().accounts.first.refreshToken, 'synthetic-rotated');
      expect(readStore().accounts.first.lastWorkspaceId, 'target-workspace');
      expect(readStore().accounts.last.lastWorkspaceId, 'current-workspace');

      await service.updateActiveAccountWorkspaceContext('target-new-workspace');
      expect(
        readStore().accounts.first.lastWorkspaceId,
        'target-new-workspace',
      );
      expect(readStore().accounts.last.lastWorkspaceId, 'current-workspace');
    },
  );

  test(
    'a failed cleanup retains the rotated token without activating it',
    () async {
      seedSwitch(expired: true);
      refreshResponse = (_) async => http.Response(
        jsonEncode(_sessionJson('target', refreshToken: 'synthetic-rotated')),
        200,
      );
      final result = await service.switchToStoredAccount(
        'target',
        beforeActivate: () async => throw StateError('Cleanup failed'),
      );

      expect(result, StoredAccountSwitchResult.failed);
      expect(readStore().activeAccountId, 'current-user');
      expect(
        readStore().accounts.singleWhere((a) => a.id == 'target').refreshToken,
        'synthetic-rotated',
      );
      expect(goTrueClient.currentUser!.id, 'current-user');
      verifyNever(() => goTrueClient.recoverSession(any()));
    },
  );

  test(
    'saves the refreshed token after profile lookup, not the old snapshot',
    () async {
      final refreshed = _MockSession();
      when(() => refreshed.refreshToken).thenReturn('new-refresh');
      when(refreshed.toJson).thenReturn({'refresh_token': 'new-refresh'});
      when(() => apiClient.getJson(any())).thenAnswer((_) async {
        when(() => goTrueClient.currentSession).thenReturn(refreshed);
        return <String, dynamic>{};
      });
      await service.syncCurrentSessionToMultiAccountStore();
      final stored =
          jsonDecode(secureStorageValues[StorageKeys.multiAccountStore]!)
              as Map<String, dynamic>;
      final account =
          (stored['accounts'] as List<dynamic>).single as Map<String, dynamic>;
      expect(account['refreshToken'], 'new-refresh');
      expect(jsonDecode(account['sessionJson'] as String), {
        'refresh_token': 'new-refresh',
      });
    },
  );

  test(
    'does not persist a profile for an account changed during lookup',
    () async {
      when(() => apiClient.getJson(any())).thenAnswer((_) async {
        when(
          () => goTrueClient.currentUser,
        ).thenReturn(_user('different-user'));
        return <String, dynamic>{};
      });
      await service.syncCurrentSessionToMultiAccountStore();
      expect(secureStorageValues[StorageKeys.multiAccountStore], isNull);
    },
  );

  test('syncCurrentSessionToMultiAccountStore keeps '
      'active account valid after trim', () async {
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
  });

  void clearSdkSession() {
    when(goTrueClient.signOut).thenAnswer((_) async {
      when(() => goTrueClient.currentUser).thenReturn(null);
      when(() => goTrueClient.currentSession).thenReturn(null);
    });
  }

  Future<http.Response> acceptRevocation(http.Request request) async {
    final payload = jsonDecode(request.body) as Map<String, dynamic>;
    expect(payload['refresh_token'], isNotEmpty);
    return request.url.path.endsWith('/token')
        ? http.Response('{"access_token":"synthetic-revoke-access"}', 200)
        : http.Response('', 204);
  }

  test(
    'revokes an inactive account before deleting it from secure storage',
    () async {
      seedSwitch(expired: true);
      refreshResponse = (request) {
        expect(readStore().accounts.any((a) => a.id == 'target'), isTrue);
        expect(goTrueClient.currentUser!.id, 'current-user');
        return acceptRevocation(request);
      };

      final result = await service.removeStoredAccount('target');

      expect(result.success, isTrue);
      expect(result.revocationUnconfirmed, isFalse);
      expect(readStore().accounts.single.id, 'current-user');
      expect(readStore().activeAccountId, 'current-user');
      expect(goTrueClient.currentUser!.id, 'current-user');
      expect(refreshRequests, hasLength(2));
      for (final request in refreshRequests) {
        final payload = jsonDecode(request.body) as Map<String, dynamic>;
        expect(payload['refresh_token'], 'synthetic-refresh');
      }
      final logout = refreshRequests.last;
      expect(logout.url.path, '/auth/v1/logout');
      expect(logout.url.queryParameters, {'scope': 'local'});
      expect(logout.headers['authorization'], 'Bearer synthetic-revoke-access');
      verifyNever(() => goTrueClient.signOut());
    },
  );

  test(
    'revokes the live active token before switching to the fallback',
    () async {
      seedSwitch();
      refreshResponse = (request) {
        expect(goTrueClient.currentUser!.id, 'current-user');
        expect(readStore().accounts.any((a) => a.id == 'current-user'), isTrue);
        return acceptRevocation(request);
      };

      final result = await service.removeStoredAccount('current-user');

      expect(result.success, isTrue);
      expect(result.switched, isTrue);
      expect(result.revocationUnconfirmed, isFalse);
      expect(goTrueClient.currentUser!.id, 'target');
      expect(readStore().accounts.single.id, 'target');
      expect(readStore().activeAccountId, 'target');
      expect(refreshRequests, hasLength(2));
      for (final request in refreshRequests) {
        final payload = jsonDecode(request.body) as Map<String, dynamic>;
        expect(payload['refresh_token'], 'current-live-refresh');
      }
    },
  );

  test(
    'a transient revoke failure still removes and reports the warning',
    () async {
      seedSwitch();
      refreshResponse = (request) async {
        if (request.url.path.endsWith('/logout')) {
          throw http.ClientException('Synthetic network error');
        }
        return await acceptRevocation(request);
      };

      final result = await service.removeStoredAccount('target');

      expect(result.success, isTrue);
      expect(result.revocationUnconfirmed, isTrue);
      expect(readStore().accounts.single.id, 'current-user');
      expect(refreshRequests, hasLength(2));
    },
  );

  test(
    'removes the active account even if the fallback needs sign-in',
    () async {
      seedSwitch(expired: true);
      clearSdkSession();
      refreshResponse = (request) {
        final payload = jsonDecode(request.body) as Map<String, dynamic>;
        if (payload['refresh_token'] == 'synthetic-refresh') {
          return Future.value(http.Response('{"error":"invalid_grant"}', 400));
        }
        return acceptRevocation(request);
      };

      final result = await service.removeStoredAccount('current-user');

      expect(result.success, isTrue);
      expect(result.switched, isFalse);
      expect(result.revocationUnconfirmed, isFalse);
      expect(goTrueClient.currentUser, isNull);
      expect(readStore().accounts.single.id, 'target');
    },
  );

  for (final (status, body) in [
    (400, '{"error":"invalid_grant"}'),
    (401, ''),
  ]) {
    test(
      'already-invalid session ($status) is removed without warning',
      () async {
        seedSwitch();
        refreshResponse = (_) async => http.Response(body, status);

        final result = await service.removeStoredAccount('target');

        expect(result.success, isTrue);
        expect(result.revocationUnconfirmed, isFalse);
        expect(readStore().accounts.single.id, 'current-user');
        expect(refreshRequests, hasLength(1));
      },
    );
  }

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

      when(() => goTrueClient.currentUser).thenReturn(_user('only-user'));
      clearSdkSession();
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
    'removeStoredAccount keeps final account when Supabase sign-out fails',
    () async {
      secureStorageValues[StorageKeys.multiAccountStore] = jsonEncode({
        'version': 1,
        'activeAccountId': 'only-user',
        'accounts': [
          _storedAccount(id: 'only-user', lastActiveAt: 100, refreshToken: ''),
        ],
      });
      when(() => goTrueClient.currentUser).thenReturn(_user('only-user'));
      when(
        () => goTrueClient.signOut(),
      ).thenThrow(const AuthException('sign-out failed'));

      final result = await service.removeStoredAccount('only-user');

      expect(result.success, isFalse);
      expect(result.switched, isFalse);
      expect(result.error, 'sign-out failed');
      expect(
        secureStorageValues.containsKey(StorageKeys.multiAccountStore),
        isTrue,
      );
      verify(() => goTrueClient.signOut()).called(1);
      verifyNever(() => googleIdentityClient.signOut());
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

      final result = await service.signOutAllAccounts();

      expect(result.success, isTrue);
      expect(
        secureStorageValues.containsKey(StorageKeys.multiAccountStore),
        isFalse,
      );
      verify(() => goTrueClient.signOut()).called(1);
      verify(() => googleIdentityClient.signOut()).called(1);
    },
  );

  test('signOutAllAccounts keeps store when Supabase sign-out fails', () async {
    secureStorageValues[StorageKeys.multiAccountStore] = jsonEncode({
      'version': 1,
      'activeAccountId': 'user-a',
      'accounts': [
        _storedAccount(id: 'user-a', lastActiveAt: 100, refreshToken: ''),
        _storedAccount(id: 'user-b', lastActiveAt: 90, refreshToken: ''),
      ],
    });
    when(
      () => goTrueClient.signOut(),
    ).thenThrow(const AuthException('sign-out failed'));

    final result = await service.signOutAllAccounts();

    expect(result.success, isFalse);
    expect(result.error, 'sign-out failed');
    expect(
      secureStorageValues.containsKey(StorageKeys.multiAccountStore),
      isTrue,
    );
    verify(() => goTrueClient.signOut()).called(1);
    verify(() => googleIdentityClient.signOut()).called(1);
  });
}
