import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/settings/cubit/experimental_apps_cubit.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('Mail, Meet, Chat, and Notes are opt-in and cached on device', () async {
    const ids = ['mail', 'meet', 'chat', 'notes'];
    final settings = SettingsRepository();
    final first = ExperimentalAppsCubit(settingsRepository: settings);
    await first.load();
    for (final id in ids) {
      expect(AppRegistry.experimentalModuleIds, contains(id));
      expect(AppRegistry.coreModuleIds, isNot(contains(id)));
      expect(first.state.isEnabled(id), isFalse);
      await first.setModuleEnabled(moduleId: id, enabled: true);
    }
    await first.close();

    final restored = ExperimentalAppsCubit(settingsRepository: settings);
    await restored.load();
    for (final id in ids) {
      expect(restored.state.isEnabled(id), isTrue);
    }
    await restored.setModuleEnabled(moduleId: 'notes', enabled: false);
    await restored.close();

    final reopened = ExperimentalAppsCubit(settingsRepository: settings);
    addTearDown(reopened.close);
    await reopened.load();
    expect(reopened.state.isEnabled('notes'), isFalse);
    expect(reopened.state.isEnabled('mail'), isTrue);
  });
}
