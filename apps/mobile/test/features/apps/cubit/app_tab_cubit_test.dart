import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
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
