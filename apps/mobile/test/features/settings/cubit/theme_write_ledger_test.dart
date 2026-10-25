import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/settings/cubit/theme_cubit.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_platform_interface.dart';

/// Platform store that holds every write until the test settles it. A
/// settled write is stored then, so writes can land in any order.
class _ScriptedStore extends InMemorySharedPreferencesStore {
  _ScriptedStore() : super.withData({'flutter.theme-mode': 'light'});

  final writes = <(Object, Completer<bool>)>[];
  final _dispatched = StreamController<void>.broadcast();

  @override
  Future<bool> setValue(String valueType, String key, Object value) async {
    final settle = Completer<bool>();
    writes.add((value, settle));
    _dispatched.add(null);
    if (!await settle.future) return false;
    return await super.setValue(valueType, key, value);
  }

  /// Runs [action] and waits for the write it dispatches.
  Future<(Object, Completer<bool>)> dispatch(void Function() action) async {
    final next = _dispatched.stream.first;
    action();
    await next;
    return writes.last;
  }

  Future<Object?> stored() async => (await getAll())['flutter.theme-mode'];
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late _ScriptedStore store;
  late SettingsRepository settings;
  late ThemeCubit theme;

  setUp(() {
    store = _ScriptedStore();
    SharedPreferences.resetStatic();
    SharedPreferencesStorePlatform.instance = store;
    settings = SettingsRepository();
    theme = ThemeCubit(
      settingsRepository: settings,
      initialThemeMode: ThemeCubit.parseThemeMode('light'),
    );
    addTearDown(theme.close);
  });

  Future<void> expectSettled(String mode) async {
    expect(theme.state.themeMode.name, mode, reason: 'UI');
    expect(await settings.getThemeMode(), mode, reason: 'cache');
    expect(await store.stored(), mode, reason: 'store');
  }

  test('a repair held across a newer successful choice keeps the newer '
      'choice (newest saved first)', () async {
    late Future<bool> older;
    late Future<bool> newer;
    late Future<bool> latest;
    final a = await store.dispatch(
      () => older = theme.setThemeMode(ThemeCubit.parseThemeMode('dark')),
    );
    final b = await store.dispatch(
      () => newer = theme.setThemeMode(ThemeCubit.parseThemeMode('system')),
    );
    b.$2.complete(true);
    expect(await newer, isTrue);

    // A is stored last, so a repair to system is dispatched and held.
    final repair = await store.dispatch(() => a.$2.complete(true));
    expect(repair.$1, 'system');
    final c = await store.dispatch(
      () => latest = theme.setThemeMode(ThemeCubit.parseThemeMode('light')),
    );
    c.$2.complete(true);
    expect(await latest, isTrue);
    expect(theme.state.themeMode.name, 'light');

    // The old repair lands after C; the ledger re-settles to C.
    final again = await store.dispatch(() => repair.$2.complete(true));
    expect(again.$1, 'light');
    again.$2.complete(true);
    expect(await older, isFalse);
    expect(store.writes, hasLength(5));
    await expectSettled('light');
  });

  test('a repair held across a newer successful choice keeps the newer '
      'choice (newest failed first)', () async {
    late Future<bool> older;
    late Future<bool> newer;
    late Future<bool> latest;
    final a = await store.dispatch(
      () => older = theme.setThemeMode(ThemeCubit.parseThemeMode('dark')),
    );
    final b = await store.dispatch(
      () => newer = theme.setThemeMode(ThemeCubit.parseThemeMode('system')),
    );
    b.$2.complete(false);
    expect(await newer, isFalse);

    // A saves; the cache still holds B, so a repair to dark is held.
    final repair = await store.dispatch(() => a.$2.complete(true));
    expect(repair.$1, 'dark');
    final c = await store.dispatch(
      () => latest = theme.setThemeMode(ThemeCubit.parseThemeMode('light')),
    );
    c.$2.complete(true);
    expect(await latest, isTrue);

    final again = await store.dispatch(() => repair.$2.complete(true));
    expect(again.$1, 'light');
    again.$2.complete(true);
    // A returns after settling and is no longer the newest choice.
    expect(await older, isFalse);
    expect(store.writes, hasLength(5));
    await expectSettled('light');
  });

  test('a newer dispatch failing during a held repair settles to the newest '
      'saved choice', () async {
    late Future<bool> older;
    late Future<bool> newer;
    late Future<bool> failing;
    final a = await store.dispatch(
      () => older = theme.setThemeMode(ThemeCubit.parseThemeMode('dark')),
    );
    final b = await store.dispatch(
      () => newer = theme.setThemeMode(ThemeCubit.parseThemeMode('system')),
    );
    b.$2.complete(true);
    expect(await newer, isTrue);
    final repair = await store.dispatch(() => a.$2.complete(true));
    final c = await store.dispatch(
      () => failing = theme.setThemeMode(ThemeCubit.parseThemeMode('light')),
    );
    c.$2.complete(false);
    expect(await failing, isFalse);
    expect(theme.state.themeMode.name, 'system');

    // The repair completes in order, but the cache now holds C's failed
    // value, so the key is written back to the newest choice.
    final again = await store.dispatch(() => repair.$2.complete(true));
    expect(again.$1, 'system');
    again.$2.complete(true);
    expect(await older, isFalse);
    await expectSettled('system');
  });

  for (final (label, fail) in [
    ('fails', (Completer<bool> write) => write.complete(false)),
    (
      'throws',
      (Completer<bool> write) => write.completeError(Exception('disk full')),
    ),
  ]) {
    test('a repair that $label is not retried and publishes nothing', () async {
      late Future<bool> older;
      late Future<bool> newer;
      final a = await store.dispatch(
        () => older = theme.setThemeMode(ThemeCubit.parseThemeMode('dark')),
      );
      final b = await store.dispatch(
        () => newer = theme.setThemeMode(ThemeCubit.parseThemeMode('system')),
      );
      b.$2.complete(true);
      expect(await newer, isTrue);
      final repair = await store.dispatch(() => a.$2.complete(true));
      fail(repair.$2);
      expect(await older, isFalse);

      // Bounded: no further write; UI and cache keep the newest choice.
      expect(store.writes, hasLength(3));
      expect(theme.state.themeMode.name, 'system');
      expect(await settings.getThemeMode(), 'system');
      // The older value stays stored until the next write settles the key.
      expect(await store.stored(), 'dark');

      final next = await store.dispatch(
        () =>
            unawaited(theme.setThemeMode(ThemeCubit.parseThemeMode('system'))),
      );
      next.$2.complete(true);
      await Future<void>.delayed(Duration.zero);
      await expectSettled('system');
    });
  }

  test('a throwing write keeps the theme and restores storage', () async {
    late Future<bool> write;
    final a = await store.dispatch(
      () => write = theme.setThemeMode(ThemeCubit.parseThemeMode('dark')),
    );
    final repair = await store.dispatch(
      () => a.$2.completeError(Exception('disk full')),
    );
    expect(repair.$1, 'light');
    repair.$2.complete(true);
    expect(await write, isFalse);
    await expectSettled('light');
  });

  test('every two- and three-write schedule ends on the newest saved '
      'choice', () async {
    List<List<int>> permutations(List<int> items) => items.isEmpty
        ? [<int>[]]
        : [
            for (final first in items)
              for (final rest in permutations(
                items.where((item) => item != first).toList(),
              ))
                [first, ...rest],
          ];
    Future<void> pump() async {
      for (var i = 0; i < 5; i++) {
        await Future<void>.delayed(Duration.zero);
      }
    }

    final modes = [
      'dark',
      'system',
      'light',
    ].map(ThemeCubit.parseThemeMode).toList();
    var schedules = 0;
    for (final count in [2, 3]) {
      for (var mask = 0; mask < (1 << count); mask++) {
        for (final order in permutations(List.generate(count, (i) => i))) {
          final label = 'n=$count mask=$mask order=$order';
          final store = _ScriptedStore();
          SharedPreferences.resetStatic();
          SharedPreferencesStorePlatform.instance = store;
          final settings = SettingsRepository();
          final theme = ThemeCubit(
            settingsRepository: settings,
            initialThemeMode: ThemeCubit.parseThemeMode('light'),
          );
          final results = <Future<bool>>[];
          for (var i = 0; i < count; i++) {
            await store.dispatch(
              () => results.add(theme.setThemeMode(modes[i])),
            );
          }
          for (final index in order) {
            store.writes[index].$2.complete((mask & (1 << index)) != 0);
            await pump();
          }
          // Repairs succeed; settling must stay bounded.
          for (var i = count; i < store.writes.length; i++) {
            expect(i, lessThan(count + 4), reason: '$label rewrite loop');
            store.writes[i].$2.complete(true);
            await pump();
          }
          await Future.wait(results);

          var expected = 'light';
          for (var i = 0; i < count; i++) {
            if ((mask & (1 << i)) != 0) expected = modes[i].name;
          }
          expect(theme.state.themeMode.name, expected, reason: '$label UI');
          expect(await settings.getThemeMode(), expected, reason: label);
          expect(await store.stored(), expected, reason: '$label store');
          await theme.close();
          schedules++;
        }
      }
    }
    expect(schedules, 56);
  });
}
