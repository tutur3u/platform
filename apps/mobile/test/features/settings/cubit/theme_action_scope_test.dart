import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/settings/cubit/theme_cubit.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_platform_interface.dart';

/// Platform store that holds each dispatched write and then reports [result].
class _HeldStore extends InMemorySharedPreferencesStore {
  _HeldStore({this.result = true})
    : super.withData({'flutter.theme-mode': 'light'});

  final bool result;
  final dispatched = Completer<void>();
  final release = Completer<void>();

  @override
  Future<bool> setValue(String valueType, String key, Object value) async {
    if (!dispatched.isCompleted) {
      dispatched.complete();
      await release.future;
      if (!result) return false;
    }
    return await super.setValue(valueType, key, value);
  }
}

/// Platform store that holds every write until the test settles it.
class _ScriptedStore extends InMemorySharedPreferencesStore {
  _ScriptedStore() : super.withData({'flutter.theme-mode': 'light'});

  final writes = <(Object, Completer<bool>)>[];
  final _dispatched = StreamController<void>.broadcast();

  Future<void> nextDispatch() => _dispatched.stream.first;

  @override
  Future<bool> setValue(String valueType, String key, Object value) async {
    final settle = Completer<bool>();
    writes.add((value, settle));
    _dispatched.add(null);
    if (!await settle.future) return false;
    return await super.setValue(valueType, key, value);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({'theme-mode': 'light'}));
  test('manual choice retains persistence and immediate state', () async {
    final settings = SettingsRepository();
    final theme = ThemeCubit(settingsRepository: settings);
    await theme.setThemeMode(ThemeMode.dark);
    expect(theme.state.themeMode, ThemeMode.dark);
    expect(await settings.getThemeMode(), 'dark');
    await theme.close();
  });
  test(
    'actor ABA during preference await prevents write and emission',
    () async {
      var epoch = 0;
      final settings = SettingsRepository();
      final theme = ThemeCubit(
        settingsRepository: settings,
        initialThemeMode: ThemeMode.light,
      );
      final pending = theme.setThemeMode(
        ThemeMode.dark,
        isCurrent: () => epoch == 0,
      );
      epoch += 2;
      await pending;
      expect(theme.state.themeMode, ThemeMode.light);
      expect(await settings.getThemeMode(), 'light');
      await theme.close();
    },
  );
  test('dispose during preference await prevents write and emission', () async {
    final settings = SettingsRepository();
    final theme = ThemeCubit(settingsRepository: settings);
    final pending = theme.setThemeMode(ThemeMode.dark, isCurrent: () => true);
    await theme.close();
    await pending;
    expect(await settings.getThemeMode(), 'light');
  });
  test('expired action before admission does not change preference', () async {
    final settings = SettingsRepository();
    final theme = ThemeCubit(settingsRepository: settings);
    await theme.setThemeMode(ThemeMode.dark, isCurrent: () => false);
    expect(await settings.getThemeMode(), 'light');
    expect(theme.state.themeMode, ThemeMode.system);
    await theme.close();
  });
  test('a scope change after dispatch cannot cancel the write', () async {
    var epoch = 0;
    final store = _HeldStore();
    SharedPreferences.resetStatic();
    SharedPreferencesStorePlatform.instance = store;
    final settings = SettingsRepository();
    final theme = ThemeCubit(
      settingsRepository: settings,
      initialThemeMode: ThemeMode.light,
    );
    final pending = theme.setThemeMode(
      ThemeMode.dark,
      isCurrent: () => epoch == 0,
    );
    await store.dispatched.future;
    epoch += 2;
    store.release.complete();
    // Past the linearization point the write stands, and the device theme
    // follows what was stored instead of claiming a cancellation.
    expect(await pending, isTrue);
    expect(theme.state.themeMode, ThemeMode.dark);
    expect(await settings.getThemeMode(), 'dark');
    await theme.close();
  });

  test(
    'a false platform result is a failure and keeps the old theme',
    () async {
      final store = _HeldStore(result: false);
      SharedPreferences.resetStatic();
      SharedPreferencesStorePlatform.instance = store;
      final settings = SettingsRepository();
      final theme = ThemeCubit(
        settingsRepository: settings,
        initialThemeMode: ThemeMode.light,
      );
      final pending = theme.setThemeMode(ThemeMode.dark, isCurrent: () => true);
      await store.dispatched.future;
      store.release.complete();
      expect(await pending, isFalse);
      expect(theme.state.themeMode, ThemeMode.light);
      expect(await settings.getThemeMode(), 'light');
      await theme.close();
    },
  );

  test(
    'a failed older write cannot roll back a newer same-value write',
    () async {
      final store = _ScriptedStore();
      SharedPreferences.resetStatic();
      SharedPreferencesStorePlatform.instance = store;
      final settings = SettingsRepository();
      final first = store.nextDispatch();
      final older = settings.setThemeMode('dark');
      await first;
      final second = store.nextDispatch();
      final newer = settings.setThemeMode('dark');
      await second;

      // Completions arrive newest first: the newer write saves, then the
      // older one fails.
      store.writes[1].$2.complete(true);
      expect(await newer, PreferenceWriteOutcome.saved);
      store.writes[0].$2.complete(false);
      expect(await older, PreferenceWriteOutcome.failed);

      expect(store.writes, hasLength(2), reason: 'no rollback write');
      expect(await settings.getThemeMode(), 'dark');
      expect((await store.getAll())['flutter.theme-mode'], 'dark');
    },
  );

  test('a failed newer write reconciles to the older saved value', () async {
    final store = _ScriptedStore();
    SharedPreferences.resetStatic();
    SharedPreferencesStorePlatform.instance = store;
    final settings = SettingsRepository();
    final first = store.nextDispatch();
    final older = settings.setThemeMode('dark');
    await first;
    final second = store.nextDispatch();
    final newer = settings.setThemeMode('system');
    await second;

    store.writes[1].$2.complete(false);
    expect(await newer, PreferenceWriteOutcome.failed);
    // The older write is still open, so nothing is restored yet.
    expect(store.writes, hasLength(2));

    final reconcile = store.nextDispatch();
    store.writes[0].$2.complete(true);
    await reconcile;
    expect(store.writes[2].$1, 'dark');
    store.writes[2].$2.complete(true);
    expect(await older, PreferenceWriteOutcome.saved);
    expect(await settings.getThemeMode(), 'dark');
    expect((await store.getAll())['flutter.theme-mode'], 'dark');
  });

  test(
    'two successful choices completing newest first end on the newest',
    () async {
      final store = _ScriptedStore();
      SharedPreferences.resetStatic();
      SharedPreferencesStorePlatform.instance = store;
      final settings = SettingsRepository();
      final theme = ThemeCubit(
        settingsRepository: settings,
        initialThemeMode: ThemeMode.light,
      );
      addTearDown(theme.close);
      final first = store.nextDispatch();
      final older = theme.setThemeMode(ThemeMode.dark);
      await first;
      final second = store.nextDispatch();
      final newer = theme.setThemeMode(ThemeMode.system);
      await second;

      store.writes[1].$2.complete(true);
      expect(await newer, isTrue);
      expect(theme.state.themeMode, ThemeMode.system);

      // The older write is stored last; it is superseded, never published,
      // and the store is rewritten to the newest choice.
      final reconcile = store.nextDispatch();
      store.writes[0].$2.complete(true);
      await reconcile;
      expect((await store.getAll())['flutter.theme-mode'], 'dark');
      expect(store.writes[2].$1, 'system');
      store.writes[2].$2.complete(true);
      expect(await older, isFalse);

      expect(theme.state.themeMode, ThemeMode.system);
      expect(await settings.getThemeMode(), 'system');
      expect((await store.getAll())['flutter.theme-mode'], 'system');
    },
  );

  test('a late older success is reported superseded', () async {
    final store = _ScriptedStore();
    SharedPreferences.resetStatic();
    SharedPreferencesStorePlatform.instance = store;
    final settings = SettingsRepository();
    final first = store.nextDispatch();
    final older = settings.setThemeMode('dark');
    await first;
    final second = store.nextDispatch();
    final newer = settings.setThemeMode('system');
    await second;
    store.writes[1].$2.complete(true);
    expect(await newer, PreferenceWriteOutcome.saved);
    final reconcile = store.nextDispatch();
    store.writes[0].$2.complete(true);
    await reconcile;
    store.writes[2].$2.complete(true);
    expect(await older, PreferenceWriteOutcome.superseded);
  });
}
