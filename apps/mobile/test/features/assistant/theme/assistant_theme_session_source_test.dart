import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/data/models/auth_action_result.dart';
import 'package:mobile/data/models/stored_auth_account.dart';
import 'package:mobile/data/repositories/auth_repository.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_controller.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_preferences.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_session_source.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_store.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test(
    'route close saves while auth observation lives only through drain',
    () async {
      final fixture = await _Fixture.create();
      addTearDown(fixture.dispose);
      final change = fixture.controller.onChanged!;
      final release = fixture.controller.onChangeEnd!;
      final gate = fixture.holdPreferences();
      change(_choice);
      final closed = fixture.closeRoute();
      await gate.entered.future;
      final notifications = fixture.notifications;
      expect(fixture.auth.listeners, 1);
      var drained = false;
      unawaited(closed.then((_) => drained = true));
      await Future<void>.delayed(Duration.zero);
      expect(drained, isFalse);

      change(const AssistantThemePreferences());
      release();
      expect(await fixture.controller.reset(), isFalse);
      gate.release(fixture.preferences);
      await closed;

      expect(fixture.stored(), _choice);
      expect(fixture.notifications, notifications);
      expect(fixture.auth.listeners, 0);
      expect(fixture.closeRoute(), same(closed));
      fixture.logout();
      await fixture.signIn();
      expect(fixture.auth.listeners, 0);
      expect(fixture.notifications, notifications);
      expect(fixture.stored(), _choice);
    },
  );

  for (final transition in ['logout', 'logout ABA', 'account', 'MFA ABA']) {
    test(
      '$transition after route disposal revokes a held preference write',
      () async {
        final fixture = await _Fixture.create();
        addTearDown(fixture.dispose);
        final original = fixture.source.value;
        final gate = fixture.holdPreferences();
        final pending = fixture.controller.setValue(_choice);
        await gate.entered.future;
        final closed = fixture.closeRoute();
        final notifications = fixture.notifications;
        expect(fixture.auth.listeners, 1);

        switch (transition) {
          case 'logout':
            fixture.logout();
            // Cubit.state changes before delivery of its stream event.
            expect(fixture.source.value, isNull);
          case 'logout ABA':
            fixture.logout();
            await fixture.signIn();
            expect(fixture.source.value?.actorId, 'a');
            expect(fixture.source.value, isNot(same(original)));
          case 'account':
            await fixture.signIn(actorId: 'b');
            expect(fixture.source.value, isNull);
          case 'MFA ABA':
            when(fixture.repository.checkMfaRequired).thenReturn(true);
            await fixture.auth.refreshAccountAssurance();
            when(fixture.repository.checkMfaRequired).thenReturn(false);
            await fixture.auth.refreshAccountAssurance();
            expect(fixture.source.value?.actorId, 'a');
            expect(fixture.source.value, isNot(same(original)));
        }
        gate.release(fixture.preferences);
        expect(await pending, isFalse);
        await closed;

        expect(fixture.preferences.getKeys(), isEmpty);
        expect(fixture.notifications, notifications);
        expect(fixture.auth.listeners, 0);
      },
    );
  }

  for (final reauthenticate in [false, true]) {
    test(
      'close and reopen reads only the authorized flush: reauth=$reauthenticate',
      () async {
        final fixture = await _Fixture.create();
        addTearDown(fixture.dispose);
        final gate = fixture.holdPreferences();
        fixture.controller.onChanged!(_choice);
        final closed = fixture.closeRoute();
        await gate.entered.future;
        if (reauthenticate) {
          fixture.logout();
          await fixture.signIn();
        }
        final source = AssistantThemeSessionSource(
          auth: fixture.auth,
          actorId: 'a',
        );
        final replacement = AssistantThemeController(
          actor: source,
          store: fixture.store,
        );
        addTearDown(() async {
          replacement.dispose();
          await source.closeAfter(replacement.writesDrained);
        });
        expect(fixture.auth.listeners, 2);
        gate.release(fixture.preferences);
        await closed;
        await replacement.reload();
        if (reauthenticate) {
          expect(replacement.value, const AssistantThemePreferences());
          expect(fixture.preferences.getKeys(), isEmpty);
        } else {
          expect(replacement.value, _choice);
          expect(fixture.stored(), _choice);
        }
        final latest = AssistantThemePreferences.preset(
          AppearanceThemeId.forest,
        );
        expect(await replacement.setValue(latest), isTrue);
        expect(fixture.stored(), latest);
        expect(fixture.auth.listeners, 1);
      },
    );
  }

  test(
    'auth source closure revokes a held write after route disposal',
    () async {
      final fixture = await _Fixture.create();
      addTearDown(fixture.dispose);
      final gate = fixture.holdPreferences();
      fixture.controller.onChanged!(_choice);
      final closed = fixture.closeRoute();
      await gate.entered.future;
      await fixture.auth.close();
      gate.release(fixture.preferences);
      await closed;
      expect(fixture.preferences.getKeys(), isEmpty);
      expect(fixture.auth.listeners, 0);
    },
  );

  test('failed disposal storage releases its auth subscription', () async {
    final fixture = await _Fixture.create();
    addTearDown(fixture.dispose);
    final gate = fixture.holdPreferences();
    fixture.controller.onChanged!(_choice);
    final closed = fixture.closeRoute();
    await gate.entered.future;
    final notifications = fixture.notifications;
    gate.fail();
    await closed;
    expect(fixture.preferences.getKeys(), isEmpty);
    expect(fixture.auth.listeners, 0);
    expect(fixture.notifications, notifications);
  });

  test(
    'closing without writes releases auth even if a reload is held',
    () async {
      final fixture = await _Fixture.create();
      addTearDown(fixture.dispose);
      final gate = fixture.holdPreferences();
      final reload = fixture.controller.reload();
      await gate.entered.future;
      await fixture.closeRoute();
      expect(fixture.auth.listeners, 0);
      gate.release(fixture.preferences);
      await reload;
      expect(fixture.preferences.getKeys(), isEmpty);
    },
  );
}

final _choice = AssistantThemePreferences.preset(AppearanceThemeId.ocean);

supa.User _user(String actorId) => supa.User(
  id: actorId,
  appMetadata: const {},
  userMetadata: const {},
  aud: 'authenticated',
  createdAt: '2026-01-01',
);

class _Repository extends Mock implements AuthRepository {}

// Only instrument subscription ownership; all state changes use AuthCubit.
class _ObservedAuthCubit extends AuthCubit {
  _ObservedAuthCubit(AuthRepository repository)
    : super(authRepository: repository);

  int listeners = 0;

  @override
  Stream<AuthState> get stream {
    final source = super.stream;
    return Stream<AuthState>.multi((controller) {
      listeners++;
      final subscription = source.listen(
        controller.addSync,
        onError: controller.addErrorSync,
        onDone: controller.closeSync,
      );
      controller.onCancel = () async {
        listeners--;
        await subscription.cancel();
      };
    }, isBroadcast: true);
  }
}

class _Fixture {
  _Fixture(this.preferences) {
    when(repository.getCurrentUserSync).thenReturn(_user('a'));
    when(repository.getCurrentUser).thenAnswer((_) async => _user('a'));
    when(repository.checkMfaRequired).thenReturn(false);
    when(repository.onAuthStateChange).thenAnswer((_) => events.stream);
    when(
      repository.getStoredAccounts,
    ).thenAnswer((_) async => <StoredAuthAccount>[]);
    when(repository.getActiveStoredAccountId).thenAnswer((_) async => null);
    when(
      repository.syncCurrentSessionToMultiAccountStore,
    ).thenAnswer((_) async {});
    when(repository.refreshSession).thenAnswer((_) async {});
    when(
      repository.signInWithGoogle,
    ).thenAnswer((_) async => const AuthActionResult.success());
    when(repository.dispose).thenReturn(null);
    auth = _ObservedAuthCubit(repository);
    source = AssistantThemeSessionSource(auth: auth, actorId: 'a');
    store = AssistantThemeStore(
      preferences: () => _gate?.prepare() ?? Future.value(preferences),
    );
    controller = AssistantThemeController(actor: source, store: store);
    controller.addListener(() => notifications++);
  }

  static Future<_Fixture> create() async {
    final fixture = _Fixture(await SharedPreferences.getInstance());
    await fixture.controller.reload();
    return fixture;
  }

  final SharedPreferences preferences;
  final repository = _Repository();
  final events = StreamController<supa.AuthState>(sync: true);
  late final _ObservedAuthCubit auth;
  late final AssistantThemeSessionSource source;
  late final AssistantThemeStore store;
  late final AssistantThemeController controller;
  _PreferencesGate? _gate;
  Future<void>? _closed;
  int notifications = 0;

  _PreferencesGate holdPreferences() => _gate = _PreferencesGate();

  AssistantThemePreferences stored() => AssistantThemePreferences.decode(
    preferences.getString(AssistantThemeStore.keyFor('a')),
  );

  Future<void> closeRoute() {
    if (_closed case final closed?) return closed;
    controller.dispose();
    return _closed = source.closeAfter(controller.writesDrained);
  }

  void logout() {
    when(repository.getCurrentUserSync).thenReturn(null);
    events.add(const supa.AuthState(supa.AuthChangeEvent.signedOut, null));
  }

  Future<void> signIn({String actorId = 'a'}) async {
    when(repository.getCurrentUserSync).thenReturn(_user(actorId));
    when(repository.getCurrentUser).thenAnswer((_) async => _user(actorId));
    await auth.signInWithGoogle();
    expect(auth.state.status, AuthStatus.authenticated);
    expect(auth.state.user?.id, actorId);
  }

  Future<void> dispose() async {
    _gate?.release(preferences);
    await closeRoute();
    if (!auth.isClosed) await auth.close();
    await events.close();
  }
}

class _PreferencesGate {
  final entered = Completer<void>();
  final _preferences = Completer<SharedPreferences>();

  Future<SharedPreferences> prepare() {
    if (!entered.isCompleted) entered.complete();
    return _preferences.future;
  }

  void release(SharedPreferences preferences) {
    if (!_preferences.isCompleted) _preferences.complete(preferences);
  }

  void fail() => _preferences.completeError(StateError('storage unavailable'));
}
