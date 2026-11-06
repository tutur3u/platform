import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/assistant/bridge/app_assistant_client_action_bridge.dart';
import 'package:mobile/features/assistant/bridge/assistant_client_actions.dart';
import 'package:mobile/features/settings/cubit/theme_cubit.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_platform_interface.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late List<String> locations;
  late List<String> themes;
  String? workspace;
  String? actor;

  AppAssistantClientActionBridge bridge() => AppAssistantClientActionBridge(
    go: locations.add,
    setTheme: (theme, isCurrent) async {
      themes.add(theme);
      return isCurrent();
    },
    currentWorkspaceId: () => workspace,
    currentActorId: () => actor,
  );

  setUp(() {
    locations = [];
    themes = [];
    workspace = 'ws-1';
    actor = 'user-1';
  });

  test('declares exactly the effects it applies', () {
    expect(bridge().capabilities, {'theme', 'navigate'});
  });

  test('applies a valid theme marker', () async {
    final result = await bridge().apply('set_theme', {
      'success': true,
      'theme': 'dark',
    });
    expect(result.applied, isTrue);
    expect(themes, ['dark']);
  });

  test('rejects invalid or unsuccessful theme markers', () async {
    expect(
      (await bridge().apply('set_theme', {
        'success': true,
        'theme': 'neon',
      })).reason,
      'invalid_theme',
    );
    expect(
      (await bridge().apply('set_theme', {
        'success': true,
        'theme': 'dark',
        'error': 'denied',
      })).applied,
      isFalse,
    );
    expect(themes, isEmpty);
  });

  test('maps every Mira destination to a shell route', () async {
    expect(assistantAppDestinationRoutes['time_tracker'], Routes.timer);
    for (final destination in assistantAppDestinationRoutes.keys) {
      final result = await bridge().apply('open_app', {
        'success': true,
        'destination': destination,
        'wsId': 'ws-1',
      });
      expect(result.applied, isTrue, reason: destination);
    }
    expect(locations, assistantAppDestinationRoutes.values.toList());
  });

  test(
    'never navigates for another workspace or unknown destination',
    () async {
      final mismatch = await bridge().apply('open_app', {
        'success': true,
        'destination': 'finance',
        'wsId': 'ws-2',
      });
      expect(mismatch.reason, 'workspace_mismatch');
      final unknown = await bridge().apply('open_app', {
        'success': true,
        'destination': '../settings',
        'wsId': 'ws-1',
      });
      expect(unknown.reason, 'unknown_destination');
      expect(locations, isEmpty);
    },
  );

  test('reports other tools as unsupported', () async {
    final result = await bridge().apply('show_workspace_artifact', {
      'success': true,
    });
    expect(result.outcome, AssistantClientActionOutcome.unsupported);
  });

  test('registration declares bridge capabilities and unregisters itself', () {
    expect(AssistantClientActions.liveCapabilities(), isEmpty);
    expect(AssistantClientActions.chatCapabilities(), ['theme', 'immersive']);
    final first = AssistantClientActions.register(bridge());
    final second = bridge();
    final unregisterSecond = AssistantClientActions.register(second);
    first();
    expect(AssistantClientActions.current, same(second));
    expect(AssistantClientActions.chatCapabilities(), [
      'theme',
      'immersive',
      'navigate',
    ]);
    expect(AssistantClientActions.liveCapabilities(), ['theme', 'navigate']);
    unregisterSecond();
    expect(AssistantClientActions.current, isNull);
  });

  test('a stale caller performs no effect', () async {
    final theme = await bridge().apply('set_theme', {
      'success': true,
      'theme': 'dark',
    }, isCurrent: () => false);
    final open = await bridge().apply('open_app', {
      'success': true,
      'destination': 'mail',
      'wsId': 'ws-1',
    }, isCurrent: () => false);
    expect(theme.reason, 'stale');
    expect(open.reason, 'stale');
    expect(themes, isEmpty);
    expect(locations, isEmpty);
  });

  group('with the real ThemeCubit', () {
    setUp(
      () => SharedPreferences.setMockInitialValues({'theme-mode': 'light'}),
    );

    AppAssistantClientActionBridge themeBridge(ThemeCubit cubit) =>
        AppAssistantClientActionBridge(
          go: locations.add,
          setTheme: (theme, isCurrent) => cubit.setThemeMode(
            ThemeCubit.parseThemeMode(theme),
            isCurrent: isCurrent,
          ),
          currentWorkspaceId: () => workspace,
          currentActorId: () => actor,
        );

    test('a storage failure is reported, not applied', () async {
      final cubit = ThemeCubit(settingsRepository: _FailingSettings());
      addTearDown(cubit.close);
      final result = await themeBridge(
        cubit,
      ).apply('set_theme', {'success': true, 'theme': 'dark'});
      expect(result.applied, isFalse);
      expect(result.reason, 'theme_not_saved');
      expect(cubit.state.themeMode.name, 'system');
    });

    test('a false platform write is reported as theme_not_saved', () async {
      SharedPreferences.resetStatic();
      SharedPreferencesStorePlatform.instance = _RejectingStore();
      final cubit = ThemeCubit(
        settingsRepository: SettingsRepository(),
        initialThemeMode: ThemeCubit.parseThemeMode('light'),
      );
      addTearDown(cubit.close);
      final result = await themeBridge(
        cubit,
      ).apply('set_theme', {'success': true, 'theme': 'dark'});
      expect(result.applied, isFalse);
      expect(result.reason, 'theme_not_saved');
      expect(cubit.state.themeMode.name, 'light');
      expect(await SettingsRepository().getThemeMode(), 'light');
    });

    test('switching account before a delayed write cancels it', () async {
      final settings = _DelayedSettings();
      final cubit = ThemeCubit(settingsRepository: settings);
      addTearDown(cubit.close);
      final pending = themeBridge(
        cubit,
      ).apply('set_theme', {'success': true, 'theme': 'dark'});
      await settings.entered.future;
      actor = 'user-2';
      settings.release.complete();
      final result = await pending;
      expect(result.reason, 'stale');
      expect(cubit.state.themeMode.name, isNot('dark'));
      expect(await SettingsRepository().getThemeMode(), 'light');
    });
  });
}

class _FailingSettings extends SettingsRepository {
  @override
  Future<PreferenceWriteOutcome> setThemeMode(
    String mode, {
    bool Function()? shouldWrite,
  }) => Future.error(Exception('storage unavailable'));
}

class _DelayedSettings extends SettingsRepository {
  final entered = Completer<void>();
  final release = Completer<void>();

  @override
  Future<PreferenceWriteOutcome> setThemeMode(
    String mode, {
    bool Function()? shouldWrite,
  }) async {
    entered.complete();
    await release.future;
    return await super.setThemeMode(mode, shouldWrite: shouldWrite);
  }
}

class _RejectingStore extends InMemorySharedPreferencesStore {
  _RejectingStore() : super.withData({'flutter.theme-mode': 'light'});

  @override
  Future<bool> setValue(String valueType, String key, Object value) async =>
      false;
}
