import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/features/settings/cubit/sorbet_cubit.dart';
import 'package:mobile/features/settings/data/sorbet_preferences_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// In-memory account configs keyed by user, standing in for `user_configs`.
/// The device cache stays the real SharedPreferences-backed one.
class _Accounts extends SorbetPreferencesRepository {
  final Map<String, SorbetPreferences> stored = {};
  final Map<String, Completer<void>> holds = {};
  final List<String> saves = [];
  bool failSave = false;

  @override
  Future<SorbetPreferences> loadAccount(String userId) async {
    await holds[userId]?.future;
    return stored[userId] ?? const SorbetPreferences();
  }

  @override
  Future<void> saveEnabled(String userId, {required bool enabled}) async {
    if (failSave) throw Exception('offline');
    saves.add('$userId enabled=$enabled');
    stored[userId] = (stored[userId] ?? const SorbetPreferences()).copyWith(
      enabled: enabled,
    );
  }

  @override
  Future<void> saveTheme(String userId, SorbetTheme theme) async {
    if (failSave) throw Exception('offline');
    saves.add('$userId theme=${theme.preset.id}');
    stored[userId] = (stored[userId] ?? const SorbetPreferences()).copyWith(
      theme: theme,
    );
  }
}

const _matcha = SorbetTheme(preset: SorbetPreset.matcha);
const _rose = SorbetTheme(preset: SorbetPreset.rose);
const _lagoon = SorbetTheme(preset: SorbetPreset.lagoon);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late _Accounts accounts;
  late SorbetCubit cubit;

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    accounts = _Accounts();
    cubit = SorbetCubit(repository: accounts);
  });
  tearDown(() => cubit.close());

  test('the device cache applies first, then the account value wins', () async {
    SharedPreferences.setMockInitialValues({
      'sorbet-ui:u1': 'true',
      'sorbet-theme:u1': _matcha.serialize(),
    });
    accounts.stored['u1'] = const SorbetPreferences(
      enabled: false,
      theme: _rose,
    );
    final hold = accounts.holds['u1'] = Completer<void>();

    final bind = cubit.bindAccount('u1');
    await pumpEventQueue();
    expect(cubit.state.enabled, isTrue);
    expect(cubit.state.theme, _matcha);

    hold.complete();
    await bind;
    expect(cubit.state.enabled, isFalse);
    expect(cubit.state.theme, _rose);
    expect(await accounts.readCache('u1'), accounts.stored['u1']);
    expect(accounts.saves, isEmpty);
  });

  test('setEnabled applies at once and uploads only that field', () async {
    accounts.stored['u1'] = const SorbetPreferences(
      enabled: false,
      theme: _rose,
    );
    await cubit.bindAccount('u1');

    final save = cubit.setEnabled(enabled: true);
    expect(cubit.state.active, _rose);
    await save;

    expect(accounts.saves, ['u1 enabled=true']);
    expect(await accounts.pendingFields('u1'), isEmpty);
    expect((await accounts.readCache('u1'))?.enabled, isTrue);
  });

  test('an account switch fences the previous account', () async {
    const previousAppearance = SorbetPreferences(theme: _rose);
    accounts.stored['u1'] = previousAppearance;
    accounts.stored['u2'] = const SorbetPreferences(theme: _lagoon);
    final hold = accounts.holds['u1'] = Completer<void>();
    final states = <SorbetPreferences>[];
    final sub = cubit.stream.listen((s) => states.add(s.preferences));

    final first = cubit.bindAccount('u1');
    await pumpEventQueue();
    await cubit.bindAccount('u2');
    hold.complete();
    await first;
    await pumpEventQueue();
    await sub.cancel();

    expect(cubit.state.preferences, const SorbetPreferences(theme: _lagoon));
    expect(states, isNot(contains(previousAppearance)));
  });

  test('a change made while loading beats the loaded value', () async {
    accounts.stored['u1'] = const SorbetPreferences(theme: _rose);
    final hold = accounts.holds['u1'] = Completer<void>();

    final bind = cubit.bindAccount('u1');
    await pumpEventQueue();
    await cubit.setTheme(_lagoon);
    hold.complete();
    await bind;
    await pumpEventQueue();

    expect(cubit.state.theme, _lagoon);
    expect(cubit.state.enabled, isTrue);
    expect(accounts.stored['u1']?.theme, _lagoon);
  });

  test('a failed upload keeps the local value and retries on bind', () async {
    accounts.stored['u1'] = const SorbetPreferences(enabled: false);
    await cubit.bindAccount('u1');
    accounts.failSave = true;
    await cubit.setEnabled(enabled: true);
    expect(cubit.state.enabled, isTrue);
    expect(await accounts.pendingFields('u1'), {SorbetField.enabled});

    accounts.failSave = false;
    final next = SorbetCubit(repository: accounts);
    addTearDown(next.close);
    await next.bindAccount('u1');
    await pumpEventQueue();

    expect(next.state.enabled, isTrue);
    expect(accounts.saves, ['u1 enabled=true']);
    expect(await accounts.pendingFields('u1'), isEmpty);
  });

  test('an unset account value replaces a legacy false cache', () async {
    SharedPreferences.setMockInitialValues({'sorbet-ui:u1': 'false'});

    await cubit.bindAccount('u1');

    expect(cubit.state.enabled, isTrue);
    expect((await accounts.readCache('u1'))?.enabled, isTrue);
    expect(accounts.saves, isEmpty);
  });

  test('signed out devices start on and keep an explicit opt-out', () async {
    expect(cubit.state.enabled, isTrue);
    await cubit.bindAccount(null);
    expect(cubit.state.enabled, isTrue);

    await cubit.setEnabled(enabled: false);
    expect(accounts.saves, isEmpty);
    expect((await accounts.readCache(null))?.enabled, isFalse);

    final next = SorbetCubit(repository: accounts);
    addTearDown(next.close);
    await next.bindAccount(null);
    expect(next.state.enabled, isFalse);
  });
}
