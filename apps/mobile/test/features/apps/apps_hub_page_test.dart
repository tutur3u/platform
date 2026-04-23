import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/view/apps_hub_page.dart';
import 'package:mobile/features/habits/cubit/habits_access_cubit.dart';
import 'package:mobile/features/inventory/cubit/inventory_access_cubit.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/helpers.dart';

class _MockHabitsAccessCubit extends MockCubit<HabitsAccessState>
    implements HabitsAccessCubit {}

class _MockInventoryAccessCubit extends MockCubit<InventoryAccessState>
    implements InventoryAccessCubit {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('Apps hub shows one ordered feed without search', (tester) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(430, 2400);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final cubit = AppTabCubit(settingsRepository: SettingsRepository());
    final habitsAccessCubit = _MockHabitsAccessCubit();
    final inventoryAccessCubit = _MockInventoryAccessCubit();
    whenListen(
      habitsAccessCubit,
      const Stream<HabitsAccessState>.empty(),
      initialState: const HabitsAccessState(
        status: HabitsAccessStatus.loaded,
        enabled: true,
        wsId: 'team-1',
      ),
    );
    whenListen(
      inventoryAccessCubit,
      const Stream<InventoryAccessState>.empty(),
      initialState: const InventoryAccessState(
        status: InventoryAccessStatus.loaded,
        enabled: true,
        wsId: 'team-1',
      ),
    );
    addTearDown(cubit.close);
    addTearDown(habitsAccessCubit.close);
    addTearDown(inventoryAccessCubit.close);

    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider.value(value: cubit),
          BlocProvider<HabitsAccessCubit>.value(value: habitsAccessCubit),
          BlocProvider<InventoryAccessCubit>.value(value: inventoryAccessCubit),
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

    final labels = <String>[
      'Tasks',
      'Calendar',
      'Finance',
      'Timer',
      'Drive',
      'Education',
      'Inventory',
      'CRM',
    ];

    for (final label in labels) {
      expect(find.text(label), findsOneWidget);
    }

    for (var index = 1; index < labels.length; index += 1) {
      final previousY = tester.getTopLeft(find.text(labels[index - 1])).dy;
      final currentY = tester.getTopLeft(find.text(labels[index])).dy;
      expect(previousY, lessThan(currentY));
    }

    expect(find.text('Workspace tools'), findsNothing);
    expect(find.text('Choose a tool to open.'), findsNothing);
    expect(find.text('Open'), findsNothing);
    expect(find.byType(TextField), findsNothing);
  });
}
