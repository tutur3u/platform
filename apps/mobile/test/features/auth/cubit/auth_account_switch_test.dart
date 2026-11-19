import 'dart:async';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/auth_action_result.dart';
import 'package:mobile/data/models/stored_account_switch_result.dart';
import 'package:mobile/data/models/stored_auth_account.dart';
import 'package:mobile/data/repositories/auth_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

class _Repository extends Mock implements AuthRepository {}

const _source = 'synthetic-source-user';
const _target = 'synthetic-target-user';

supa.User _user(String id) => supa.User(
  id: id,
  email: '$id@example.test',
  appMetadata: const {},
  userMetadata: const {},
  aud: 'authenticated',
  createdAt: '',
);

CacheKey _key(String user) => CacheKey(
  userId: user,
  workspaceId: 'shared-workspace',
  namespace: 'account-switch-test',
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const path = MethodChannel('plugins.flutter.io/path_provider');
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  late Directory directory;
  late _Repository repo;
  late AuthCubit auth;
  late StreamController<supa.AuthState> authEvents;
  late CacheStore cache;

  setUp(() async {
    directory = await Directory.systemTemp.createTemp('synthetic-accounts-');
    messenger.setMockMethodCallHandler(path, (_) async => directory.path);
    FlutterSecureStorage.setMockInitialValues({});
    SharedPreferences.setMockInitialValues({});
    cache = CacheStore.instance;
    await cache.init();
    for (final actor in [_source, _target]) {
      await cache.write(
        key: _key(actor),
        policy: CachePolicies.metadata,
        payload: actor,
      );
    }

    repo = _Repository();
    when(repo.getCurrentUserSync).thenReturn(_user(_source));
    when(repo.checkMfaRequired).thenReturn(false);
    when(repo.refreshSession).thenAnswer((_) async {});
    authEvents = StreamController<supa.AuthState>();
    when(repo.onAuthStateChange).thenAnswer((_) => authEvents.stream);
    when(repo.getStoredAccounts).thenAnswer(
      (_) async => const [
        StoredAuthAccount(
          id: _source,
          refreshToken: '',
          lastActiveAt: 1,
          addedAt: 1,
        ),
        StoredAuthAccount(
          id: _target,
          refreshToken: '',
          lastActiveAt: 2,
          addedAt: 2,
        ),
      ],
    );
    when(repo.syncCurrentSessionToMultiAccountStore).thenAnswer((_) async {});
    auth = AuthCubit(authRepository: repo);
    await Future<void>.delayed(Duration.zero);
  });

  tearDown(() async {
    await auth.close();
    await authEvents.close();
    await cache.closeForTesting();
    messenger.setMockMethodCallHandler(path, null);
    await directory.delete(recursive: true);
  });

  Future<String?> readCache(String user) async {
    final snapshot = await cache.read<String>(
      key: _key(user),
      decode: (payload) => payload! as String,
    );
    return snapshot.data;
  }

  test(
    'publishes progress, purges outgoing cache and retains target data',
    () async {
      final ready = Completer<void>();
      when(
        () => repo.switchToStoredAccount(
          _target,
          beforeActivate: any(named: 'beforeActivate'),
        ),
      ).thenAnswer((invocation) async {
        await ready.future;
        final prepare =
            invocation.namedArguments[#beforeActivate]
                as Future<void> Function();
        await prepare();
        expect(auth.state.user?.id, _source);
        expect(await readCache(_source), isNull);
        when(repo.getCurrentUserSync).thenReturn(_user(_target));
        return StoredAccountSwitchResult.switched;
      });

      final switching = auth.switchAccount(_target);
      expect(auth.state.switchingAccountId, _target);
      expect(auth.state.user?.id, _source);
      expect(await auth.switchAccount('other-synthetic-id'), isFalse);
      ready.complete();
      expect(await switching, isTrue);
      expect(auth.state.switchingAccountId, isNull);
      expect(auth.state.user?.id, _target);
      expect(auth.state.activeAccountId, _target);
      expect(await readCache(_target), _target);
    },
  );

  test(
    'browser sign-in completes add mode and clears the email hint',
    () async {
      when(
        repo.completeAddAccountFlow,
      ).thenAnswer((_) async => (success: true, error: null));
      when(
        repo.signInWithGithub,
      ).thenAnswer((_) async => const AuthActionResult.externalFlowStarted());

      expect(
        await auth.beginAddAccountFlow(email: 'demo@example.test'),
        isTrue,
      );
      await auth.signInWithGithub();
      expect(auth.state.isAddAccountFlow, isTrue);
      expect(auth.state.addAccountEmail, 'demo@example.test');

      final user = _user(_target);
      when(repo.getCurrentUserSync).thenReturn(user);
      authEvents.add(
        supa.AuthState(
          supa.AuthChangeEvent.signedIn,
          supa.Session(
            accessToken: 'fixture-token',
            tokenType: 'bearer',
            user: user,
          ),
        ),
      );
      await Future<void>.delayed(Duration.zero);
      expect(auth.state.user?.id, _target);
      expect(auth.state.isAddAccountFlow, isFalse);
      expect(auth.state.addAccountEmail, isNull);
    },
  );

  test('publishes the warning when local removal succeeds offline', () async {
    when(() => repo.removeStoredAccount(_target)).thenAnswer(
      (_) async => (
        success: true,
        switched: false,
        error: null,
        revocationUnconfirmed: true,
      ),
    );
    when(repo.getCurrentUser).thenAnswer((_) async => _user(_source));

    expect(await auth.removeAccount(_target), isTrue);
    expect(auth.state.user?.id, _source);
    expect(auth.state.revocationUnconfirmed, isTrue);
    expect(await readCache(_target), isNull);
    expect(await readCache(_source), _source);
  });

  for (final result in [
    StoredAccountSwitchResult.failed,
    StoredAccountSwitchResult.signInRequired,
  ]) {
    test('${result.name} retains the account and its cache', () async {
      when(
        () => repo.switchToStoredAccount(
          _target,
          beforeActivate: any(named: 'beforeActivate'),
        ),
      ).thenAnswer((_) async => result);
      expect(await auth.switchAccount(_target), isFalse);
      expect(auth.state.switchingAccountId, isNull);
      expect(auth.state.user?.id, _source);
      expect(
        auth.state.expiredAccountIds.contains(_target),
        result == StoredAccountSwitchResult.signInRequired,
      );
      expect(await readCache(_source), _source);
      expect(await readCache(_target), _target);
    });
  }
}
