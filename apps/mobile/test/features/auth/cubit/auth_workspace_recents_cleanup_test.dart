import 'dart:async';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/data/models/stored_account_switch_result.dart';
import 'package:mobile/data/models/stored_auth_account.dart';
import 'package:mobile/data/repositories/auth_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_feature_cache.dart';
import 'package:mobile/features/workspace/data/workspace_recents_store.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

class _Repository extends Mock implements AuthRepository {}

const _active = 'recents-actor-a';
const _other = 'recents-actor-b';
const _unrelatedKey = 'unrelated-preference';

supa.User _user(String id) => supa.User(
  id: id,
  appMetadata: const {},
  userMetadata: const {},
  aud: 'authenticated',
  createdAt: '2026-01-01',
);

String _key(String actor) => WorkspaceRecentsStore.storageKey(actor);

Future<Set<String>> _storedActors() async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.reload();
  return {
    for (final actor in [_active, _other])
      if (prefs.getStringList(_key(actor)) != null) actor,
  };
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('plugins.flutter.io/path_provider');
  late Directory directory;
  late StreamController<supa.AuthState> events;
  late _Repository repo;

  setUp(() async {
    directory = await Directory.systemTemp.createTemp('auth-recents-');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (_) async => directory.path);
    SharedPreferences.setMockInitialValues({
      _key(_active): ['ws-1'],
      _key(_other): ['ws-2'],
      _unrelatedKey: 'kept',
    });
    events = StreamController<supa.AuthState>(sync: true);
    repo = _Repository();
    when(repo.getCurrentUserSync).thenReturn(_user(_active));
    when(repo.getCurrentUser).thenAnswer((_) async => null);
    when(repo.checkMfaRequired).thenReturn(false);
    when(repo.onAuthStateChange).thenAnswer((_) => events.stream);
    when(repo.getStoredAccounts).thenAnswer((_) async => <StoredAuthAccount>[]);
    when(repo.getActiveStoredAccountId).thenAnswer((_) async => null);
    when(repo.syncCurrentSessionToMultiAccountStore).thenAnswer((_) async {});
    when(repo.refreshSession).thenAnswer((_) async {});
    when(repo.dispose).thenReturn(null);
    when(repo.signOut).thenAnswer((_) async {});
    when(repo.signOutCurrentAccount).thenAnswer(
      (_) async => (
        success: true,
        switched: false,
        error: null,
        revocationUnconfirmed: false,
      ),
    );
    when(
      repo.signOutAllAccounts,
    ).thenAnswer((_) async => (success: true, error: null));
    when(() => repo.removeStoredAccount(any())).thenAnswer(
      (_) async => (
        success: true,
        switched: false,
        error: null,
        revocationUnconfirmed: false,
      ),
    );
    when(
      () => repo.switchToStoredAccount(
        any(),
        beforeActivate: any(named: 'beforeActivate'),
      ),
    ).thenAnswer((invocation) async {
      final prepare =
          invocation.namedArguments[#beforeActivate]
              as Future<void> Function()?;
      await prepare?.call();
      when(repo.getCurrentUserSync).thenReturn(_user(_other));
      return StoredAccountSwitchResult.switched;
    });
  });

  tearDown(() async {
    // Not awaited: a stream nothing listened to never finishes closing.
    unawaited(events.close());
    if (Hive.isBoxOpen('assistant_reaction_pending_v1')) {
      await Hive.box<dynamic>('assistant_reaction_pending_v1').close();
    }
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
    await directory.delete(recursive: true);
  });

  Future<AuthCubit> cubit() async {
    final auth = AuthCubit(authRepository: repo);
    addTearDown(() async {
      if (!auth.isClosed) await auth.close();
    });
    await Future<void>.delayed(Duration.zero);
    expect(auth.state.user?.id, _active);
    return auth;
  }

  test('signing out the current account removes only its recents', () async {
    await (await cubit()).signOutCurrentAccount();
    expect(await _storedActors(), {_other});
  });

  test('removing another account removes its recents', () async {
    await (await cubit()).removeAccount(_other);
    expect(await _storedActors(), {_active});
  });

  test('removing the active account removes its recents', () async {
    await (await cubit()).removeAccount(_active);
    expect(await _storedActors(), {_other});
  });

  for (final all in [true, false]) {
    test('signing out of every account removes all recents '
        '(${all ? 'signOutAllAccounts' : 'signOut'})', () async {
      final auth = await cubit();
      if (all) {
        await auth.signOutAllAccounts();
      } else {
        await auth.signOut();
      }
      expect(await _storedActors(), isEmpty);
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString(_unrelatedKey), 'kept');
    });
  }

  test('switching accounts keeps every list', () async {
    await (await cubit()).switchAccount(_other);
    expect(await _storedActors(), {_active, _other});
  });

  for (final addAccountFlow in [false, true]) {
    test('an ended session ${addAccountFlow ? 'keeps' : 'removes'} the '
        'outgoing recents (add account=$addAccountFlow)', () async {
      final auth = await cubit();
      if (addAccountFlow) auth.setAddAccountFlow(enabled: true);
      events.add(const supa.AuthState(supa.AuthChangeEvent.signedOut, null));
      await Future<void>.delayed(const Duration(milliseconds: 50));
      expect(
        await _storedActors(),
        addAccountFlow ? {_active, _other} : {_other},
      );
    });
  }

  test('device data cleanup ignores a missing account id', () async {
    await clearAccountDeviceData();
    expect(await _storedActors(), {_active, _other});
  });
}
