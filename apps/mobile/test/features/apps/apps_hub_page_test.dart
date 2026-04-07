import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/view/apps_hub_page.dart';
import 'package:mobile/features/habits/cubit/habits_access_cubit.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/helpers.dart';

class _MockHabitsAccessCubit extends MockCubit<HabitsAccessState>
    implements HabitsAccessCubit {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('Apps hub shows app cards without search', (tester) async {
    final cubit = AppTabCubit(settingsRepository: SettingsRepository());
    final habitsAccessCubit = _MockHabitsAccessCubit();
    whenListen(
      habitsAccessCubit,
      const Stream<HabitsAccessState>.empty(),
      initialState: const HabitsAccessState(
        status: HabitsAccessStatus.loaded,
        enabled: true,
        wsId: 'team-1',
      ),
    );
    addTearDown(cubit.close);
    addTearDown(habitsAccessCubit.close);

    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider.value(value: cubit),
          BlocProvider<HabitsAccessCubit>.value(value: habitsAccessCubit),
        ],
        child: const AppsHubPage(),
      ),
    );

    for (var i = 0; i < 12; i++) {
      await tester.pump(const Duration(milliseconds: 60));
      if (find.text('Tasks').evaluate().isNotEmpty) {
        break;
      }
    }
    await tester.pumpAndSettle();

    expect(find.text('Tasks'), findsOneWidget);
    expect(find.text('Habits'), findsOneWidget);
    expect(find.text('Calendar'), findsOneWidget);
    expect(find.text('Finance'), findsOneWidget);
    expect(find.text('Timer'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
  });
}
