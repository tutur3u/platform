import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/dashboard/cubit/dashboard_layout_cubit.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('Home order and hidden widgets survive restart', () async {
    final first = DashboardLayoutCubit(
      settingsRepository: SettingsRepository(),
    );
    await first.setOrder(['summary', 'calendar', 'tasks']);
    await first.setHidden('calendar', hidden: true);
    expect(first.state.arranged(['tasks', 'calendar', 'summary']), [
      'summary',
      'tasks',
      'calendar',
    ]);
    await first.close();

    final restored = DashboardLayoutCubit(
      settingsRepository: SettingsRepository(),
    );
    addTearDown(restored.close);
    await restored.load();
    expect(restored.state.order, ['summary', 'calendar', 'tasks']);
    expect(restored.state.hidden, ['calendar']);
    await restored.setHidden('calendar', hidden: false);
    expect(restored.state.hidden, isEmpty);
    expect(restored.state.arranged(['tasks', 'calendar', 'summary']), [
      'summary',
      'calendar',
      'tasks',
    ]);
    await restored.setOrder(['tasks', 'summary']);
    expect(restored.state.order, ['tasks', 'calendar', 'summary']);
  });
}
