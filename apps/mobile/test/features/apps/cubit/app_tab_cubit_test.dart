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

  test('app order, pins and tab visibility survive a restart', () async {
    final first = AppTabCubit(settingsRepository: SettingsRepository());
    await first.setAppOrder(['calendar', 'mail', 'tasks']);
    await first.togglePinnedApp('mail');
    await first.setShowAppsTab(value: true);
    await first.recordAppOrigin(Routes.apps);
    await first.close();
    final restored = AppTabCubit(settingsRepository: SettingsRepository());
    addTearDown(restored.close);
    await restored.loadLastApp();
    expect(restored.state.appOrder, ['calendar', 'mail', 'tasks']);
    expect(restored.state.pinnedApps, ['mail']);
    expect(restored.state.showAppsTab, isTrue);
    expect(restored.state.appOrigin, Routes.apps);
    await restored.togglePinnedApp('mail');
    expect(restored.state.pinnedApps, isEmpty);
  });

  test(
    'picker and editor share default order and honor pins and saved order',
    () async {
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
      await cubit.togglePinnedApp('mail');
      expect(ids(), ['mail', 'calendar', 'tasks']);
      await cubit.togglePinnedApp('mail');
      expect(ids(), ['calendar', 'tasks', 'mail']);
    },
  );

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
