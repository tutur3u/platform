import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/apps/widgets/apps_picker_editor.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _DelayedSettingsRepository extends SettingsRepository {
  _DelayedSettingsRepository(this.route);

  final String? route;
  final Completer<void> completer = Completer<void>();

  @override
  Future<String?> getLastAppRoute() async {
    await completer.future;
    return route;
  }
}

class _FailingShortcutRead extends SettingsRepository {
  bool failRead = true;

  @override
  Future<List<String>> getRecentApps() async {
    if (failRead) throw StateError('Preferences unavailable');
    return await super.getRecentApps();
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues(<String, Object>{
      'last-app-route': Routes.timer,
      'last-tab-route': Routes.timerRequests,
    });
  });

  test(
    'clearSelection clears persisted app route without loaded state',
    () async {
      final cubit = AppTabCubit(settingsRepository: SettingsRepository());
      addTearDown(cubit.close);

      await cubit.clearSelection();

      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString('last-app-route'), isNull);
      expect(prefs.getString('last-tab-route'), Routes.apps);
      expect(cubit.state.selectedId, isNull);
    },
  );

  for (final origin in [
    Routes.home,
    Routes.apps,
    Routes.assistant,
    Routes.notifications,
    Routes.profileRoot,
  ]) {
    test('preserves $origin as the source of an opened app', () async {
      final first = AppTabCubit(settingsRepository: SettingsRepository());
      await first.recordAppOrigin(origin);
      await first.close();
      final restored = AppTabCubit(settingsRepository: SettingsRepository());
      addTearDown(restored.close);
      await restored.loadLastApp();
      expect(restored.state.appOrigin, origin);
    });
  }

  test('saving a board as the current tab persists the Tasks list', () async {
    final settings = SettingsRepository();
    final cubit = AppTabCubit(settingsRepository: settings);
    addTearDown(cubit.close);

    await cubit.setLastTabRoute(
      Routes.taskBoardDetailViewPath('board-1', 'list'),
    );

    expect(await settings.getLastTabRoute(), Routes.tasks);
  });

  test('app order, hidden apps and tab visibility survive a restart', () async {
    final first = AppTabCubit(settingsRepository: SettingsRepository());
    await first.setAppOrder(['calendar', 'mail', 'tasks']);
    await first.setAppHidden('mail', hidden: true);
    await first.setShowAppsTab(value: true);
    await first.recordAppOrigin(Routes.apps);
    await first.close();
    final restored = AppTabCubit(settingsRepository: SettingsRepository());
    addTearDown(restored.close);
    await restored.loadLastApp();
    expect(restored.state.appOrder, ['calendar', 'mail', 'tasks']);
    expect(restored.state.hiddenAppIds, ['mail']);
    expect(restored.state.showAppsTab, isTrue);
    expect(restored.state.appOrigin, Routes.apps);
    await restored.setAppHidden('mail', hidden: false);
    expect(restored.state.hiddenAppIds, isEmpty);
  });

  test('pins and unpins persist across cubit recreation', () async {
    final first = AppTabCubit(settingsRepository: SettingsRepository());
    await Future.wait([
      first.setAppPinned('tasks', pinned: true),
      first.setAppPinned('calendar', pinned: true),
      first.setAppPinned('tasks', pinned: false),
    ]);
    expect(first.state.pinnedAppIds, ['calendar']);
    await first.close();

    final restored = AppTabCubit(settingsRepository: SettingsRepository());
    addTearDown(restored.close);
    await restored.loadLastApp();
    expect(restored.state.pinnedAppIds, ['calendar']);
  });

  test(
    'shortcut writes preserve saved pins and recents after a failed read',
    () async {
      final settings = _FailingShortcutRead();
      await settings.setPinnedApps(['finance']);
      await settings.setRecentApps(['finance']);
      final cubit = AppTabCubit(settingsRepository: settings);
      addTearDown(cubit.close);

      await cubit.loadLastApp();
      expect(await cubit.setAppPinned('tasks', pinned: true), isFalse);
      await cubit.select(AppRegistry.moduleById('calendar')!);
      expect(await settings.getPinnedApps(), ['finance']);
      expect(await SettingsRepository().getRecentApps(), ['finance']);

      settings.failRead = false;
      expect(await cubit.setAppPinned('tasks', pinned: true), isTrue);
      await cubit.select(AppRegistry.moduleById('calendar')!);
      expect(await settings.getPinnedApps(), ['finance', 'tasks']);
      expect(await settings.getRecentApps(), ['calendar', 'finance']);
    },
  );

  test(
    'recent apps deduplicate repeated launches and persist their order',
    () async {
      final first = AppTabCubit(settingsRepository: SettingsRepository());
      await Future.wait([
        for (final id in [
          'calendar',
          'finance',
          'calendar',
          'calendar',
          'tasks',
        ])
          first.select(AppRegistry.moduleById(id)!),
      ]);
      expect(first.state.recentAppIds, ['tasks', 'calendar', 'finance']);
      await first.close();

      final restored = AppTabCubit(settingsRepository: SettingsRepository());
      addTearDown(restored.close);
      await restored.loadLastApp();
      expect(restored.state.recentAppIds, ['tasks', 'calendar', 'finance']);
    },
  );

  test(
    'route entry records recent apps without replacing the current app on disk',
    () async {
      final settings = SettingsRepository();
      final cubit = AppTabCubit(settingsRepository: settings);
      addTearDown(cubit.close);
      final recent = cubit.stream.firstWhere(
        (state) => state.recentAppIds.join(',') == 'calendar,tasks',
      );
      cubit
        ..syncFromLocation(Routes.tasks)
        ..syncFromLocation(Routes.calendar)
        ..syncFromLocation(Routes.calendar);
      await recent;
      expect(cubit.state.selectedId, 'calendar');
      expect(await settings.getRecentApps(), ['calendar', 'tasks']);
      expect(await settings.getLastAppRoute(), Routes.timer);
    },
  );

  test('picker and editor keep hidden apps below shown apps', () async {
    final cubit = AppTabCubit(settingsRepository: SettingsRepository());
    addTearDown(cubit.close);
    final modules = [
      'mail',
      'calendar',
      'tasks',
    ].map((id) => AppRegistry.moduleById(id)!).toList();
    List<String> ids() =>
        arrangeApps(modules, cubit).map((app) => app.id).toList();
    expect(ids(), ['tasks', 'calendar', 'mail']);
    await cubit.setAppOrder(['calendar', 'tasks', 'mail']);
    expect(ids(), ['calendar', 'tasks', 'mail']);
    await cubit.setAppHidden('calendar', hidden: true);
    expect(ids(), ['tasks', 'mail', 'calendar']);
    await cubit.setAppHidden('calendar', hidden: false);
    expect(ids(), ['calendar', 'tasks', 'mail']);
  });

  test('clearSelection cancels stale loadLastApp result', () async {
    final settings = _DelayedSettingsRepository(Routes.timer);
    final cubit = AppTabCubit(settingsRepository: settings);
    addTearDown(cubit.close);

    final pendingLoad = cubit.loadLastApp();
    await cubit.clearSelection();
    settings.completer.complete();
    await pendingLoad;

    expect(cubit.state.selectedId, isNull);
  });
}
