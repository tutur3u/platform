import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/view/apps_hub_page.dart';
import 'package:mobile/features/apps/widgets/apps_picker_editor.dart';
import 'package:mobile/features/habits/cubit/habits_access_cubit.dart';
import 'package:mobile/features/inventory/cubit/inventory_access_cubit.dart';
import 'package:mobile/features/settings/cubit/experimental_apps_cubit.dart';
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

  testWidgets('Apps hub shows core apps by default without search', (
    tester,
  ) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(430, 2400);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final cubit = AppTabCubit(settingsRepository: SettingsRepository());
    final experimentalAppsCubit = ExperimentalAppsCubit(
      settingsRepository: SettingsRepository(),
    );
    await experimentalAppsCubit.load();
    addTearDown(cubit.close);
    addTearDown(experimentalAppsCubit.close);
    final showGrid = ValueNotifier(false);
    addTearDown(showGrid.dispose);

    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider.value(value: cubit),
          BlocProvider.value(value: experimentalAppsCubit),
        ],
        child: ValueListenableBuilder<bool>(
          valueListenable: showGrid,
          builder: (context, value, _) => AppsHubPage(showGrid: value),
        ),
      ),
    );

    for (var i = 0; i < 12; i++) {
      await tester.pump(const Duration(milliseconds: 60));
      if (find.text('Tasks').evaluate().isNotEmpty) {
        break;
      }
    }
    await tester.pumpAndSettle();

    final labels = <String>['Tasks', 'Calendar', 'Finance'];

    for (final label in labels) {
      expect(find.text(label), findsOneWidget);
    }
    for (final label in [
      'Mail',
      'Chat',
      'Meet',
      'Notes',
      'Timer',
      'Drive',
      'Education',
      'Inventory',
      'CRM',
    ]) {
      expect(find.text(label), findsNothing);
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
    expect(
      find.text('Assignments, boards, estimates, and portfolio planning.'),
      findsOneWidget,
    );

    expect(find.byType(SegmentedButton<bool>), findsNothing);
    showGrid.value = true;
    await tester.pumpAndSettle();
    final semantics = tester.ensureSemantics();
    final tasksSemantics = tester
        .getSemantics(find.text('Tasks'))
        .getSemanticsData();
    expect(tasksSemantics.label, 'Tasks');
    expect(tasksSemantics.flagsCollection.isButton, isTrue);
    expect(find.text('Tasks'), findsOneWidget);
    expect(find.text('Chat'), findsNothing);
    expect(
      find.text('Assignments, boards, estimates, and portfolio planning.'),
      findsNothing,
    );
    expect(
      tester.getTopLeft(find.text('Tasks')).dy,
      tester.getTopLeft(find.text('Calendar')).dy,
    );

    tester.view.physicalSize = const Size(200, 2400);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    tester.view.physicalSize = const Size(430, 2400);
    await tester.pumpAndSettle();

    showGrid.value = false;
    await tester.pumpAndSettle();
    expect(find.byTooltip('Hide app'), findsNothing);
    expect(
      find.text('Assignments, boards, estimates, and portfolio planning.'),
      findsOneWidget,
    );
    semantics.dispose();
  });

  testWidgets('Apps hub shows enabled experimental apps after core apps', (
    tester,
  ) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(430, 2400);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final cubit = AppTabCubit(settingsRepository: SettingsRepository());
    final experimentalAppsCubit = ExperimentalAppsCubit(
      settingsRepository: SettingsRepository(),
    );
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
    await experimentalAppsCubit.load();
    for (final moduleId in ['chat', 'timer', 'drive', 'inventory', 'crm']) {
      await experimentalAppsCubit.setModuleEnabled(
        moduleId: moduleId,
        enabled: true,
      );
    }
    addTearDown(cubit.close);
    addTearDown(experimentalAppsCubit.close);
    addTearDown(habitsAccessCubit.close);
    addTearDown(inventoryAccessCubit.close);

    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider.value(value: cubit),
          BlocProvider.value(value: experimentalAppsCubit),
          BlocProvider<HabitsAccessCubit>.value(value: habitsAccessCubit),
          BlocProvider<InventoryAccessCubit>.value(value: inventoryAccessCubit),
        ],
        child: const AppsHubPage(),
      ),
    );

    await tester.pumpAndSettle();

    final labels = <String>[
      'Tasks',
      'Chat',
      'Calendar',
      'Finance',
      'Timer',
      'Drive',
      'Inventory',
      'CRM',
    ];

    for (final label in labels) {
      expect(find.text(label), findsOneWidget);
    }

    expect(
      tester.getTopLeft(find.text('Tasks')).dy,
      tester.getTopLeft(find.text('Chat')).dy,
    );
    expect(
      tester.getTopLeft(find.text('Tasks')).dy,
      lessThan(tester.getTopLeft(find.text('Timer')).dy),
    );

    final chatStartX = tester.getTopLeft(find.text('Chat')).dx;
    final drag = await tester.startGesture(
      tester.getCenter(find.text('Tasks')),
    );
    await tester.pump(const Duration(milliseconds: 350));
    await drag.moveTo(tester.getCenter(find.text('Finance')));
    await tester.pump(const Duration(milliseconds: 350));
    expect(cubit.state.appOrder, isEmpty);
    final chatReflowX = tester.getTopLeft(find.text('Chat')).dx;
    expect(
      chatReflowX,
      lessThan(chatStartX),
      reason: 'Chat should fill the drag gap ($chatStartX -> $chatReflowX)',
    );
    await drag.up();
    await tester.pump(const Duration(milliseconds: 300));
    expect(cubit.state.appOrder.take(4), [
      'chat',
      'calendar',
      'finance',
      'tasks',
    ]);
  });

  testWidgets('reorder cell margin exits ordering without launching an app', (
    tester,
  ) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(430, 2400);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final cubit = AppTabCubit(settingsRepository: SettingsRepository());
    final experimental = ExperimentalAppsCubit(
      settingsRepository: SettingsRepository(),
    );
    await experimental.load();
    addTearDown(cubit.close);
    addTearDown(experimental.close);
    var selected = 0;
    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider.value(value: cubit),
          BlocProvider.value(value: experimental),
        ],
        child: AppsHubPage(onSelected: (_) => selected++),
      ),
    );
    await tester.pumpAndSettle();
    await tester.longPress(find.text('Tasks'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.byTooltip('Hide app'), findsWidgets);
    final cell = tester.getRect(
      find.byKey(const ValueKey('apps-grid-position-calendar')),
    );
    await tester.tapAt(cell.topLeft + const Offset(2, 70));
    await tester.pump(const Duration(milliseconds: 300));
    expect(selected, 0);
    expect(find.byTooltip('Hide app'), findsNothing);
    await tester.tap(find.text('Calendar'));
    await tester.pump();
    expect(selected, 1);
    await tester.longPress(find.text('Tasks'));
    await tester.pump(const Duration(milliseconds: 300));
    final taskCell = tester.getRect(
      find.byKey(const ValueKey('apps-grid-position-tasks')),
    );
    await tester.tapAt(Offset(taskCell.right + 6, taskCell.top + 70));
    await tester.pump(const Duration(milliseconds: 300));
    expect(selected, 1);
    expect(find.byTooltip('Hide app'), findsNothing);
  });

  testWidgets('short hold and ordinary scroll do not start app reorder', (
    tester,
  ) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(300, 400);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final cubit = AppTabCubit(settingsRepository: SettingsRepository());
    final experimental = ExperimentalAppsCubit(
      settingsRepository: SettingsRepository(),
    );
    await experimental.load();
    for (final id in ['chat', 'timer', 'drive', 'crm']) {
      await experimental.setModuleEnabled(moduleId: id, enabled: true);
    }
    addTearDown(cubit.close);
    addTearDown(experimental.close);
    var selected = 0;
    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider.value(value: cubit),
          BlocProvider.value(value: experimental),
        ],
        child: AppsHubPage(onSelected: (_) => selected++),
      ),
    );
    await tester.pumpAndSettle();
    final semantics = tester.ensureSemantics();
    final taskSemantics = tester
        .getSemantics(find.text('Tasks'))
        .getSemanticsData();
    expect(taskSemantics.flagsCollection.isButton, isTrue);
    final shortHold = await tester.startGesture(
      tester.getCenter(find.text('Tasks')),
    );
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.byTooltip('Hide app'), findsNothing);
    await shortHold.up();
    await tester.pump(const Duration(milliseconds: 100));
    expect(selected, 1);
    final scroll = await tester.startGesture(
      tester.getCenter(find.text('Tasks')),
    );
    await scroll.moveBy(const Offset(0, -40));
    await tester.pump(const Duration(milliseconds: 20));
    await scroll.moveBy(const Offset(0, -100));
    await tester.pump(const Duration(milliseconds: 350));
    await scroll.up();
    await tester.pumpAndSettle();
    final position = tester
        .state<ScrollableState>(find.byType(Scrollable).first)
        .position;
    expect(position.pixels, greaterThan(0));
    expect(find.byTooltip('Hide app'), findsNothing);
    expect(cubit.state.appOrder, isEmpty);
    expect(selected, 1);
    semantics.dispose();
  });

  testWidgets('hide asks for confirmation and moves app below divider', (
    tester,
  ) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(430, 2400);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final cubit = AppTabCubit(settingsRepository: SettingsRepository());
    final experimental = ExperimentalAppsCubit(
      settingsRepository: SettingsRepository(),
    );
    await experimental.load();
    addTearDown(cubit.close);
    addTearDown(experimental.close);
    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider.value(value: cubit),
          BlocProvider.value(value: experimental),
        ],
        child: const AppsHubPage(),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byTooltip('Hide app'), findsNothing);
    final titleCenter = tester.getCenter(find.text('Tasks')).dx;
    await tester.longPress(find.text('Tasks'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.byTooltip('Hide app'), findsWidgets);
    final taskTile = find.byKey(const ValueKey('apps-grid-position-tasks'));
    final taskIcon = find
        .descendant(of: taskTile, matching: find.byType(Icon))
        .first;
    expect(tester.getCenter(taskIcon).dx, closeTo(titleCenter, 1));
    expect(tester.getCenter(find.text('Tasks')).dx, closeTo(titleCenter, 1));
    await tester.tap(find.byTooltip('Hide app').first);
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Hide this app?'), findsOneWidget);
    expect(cubit.state.hiddenAppIds, isEmpty);
    await tester.tap(find.widgetWithText(FilledButton, 'Hide app'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(cubit.state.hiddenAppIds, ['tasks']);
    expect(find.text('Hidden apps'), findsOneWidget);
    expect(
      tester.getTopLeft(find.text('Tasks')).dy,
      greaterThan(tester.getTopLeft(find.text('Finance')).dy),
    );
    await tester.tap(find.byTooltip('Show app'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(cubit.state.hiddenAppIds, isEmpty);
    await tester.tapAt(const Offset(400, 1200));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.byTooltip('Hide app'), findsNothing);
  });

  testWidgets('disabled experiments can be shown from their own section', (
    tester,
  ) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(430, 2400);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final apps = AppTabCubit(settingsRepository: SettingsRepository());
    final experiments = ExperimentalAppsCubit(
      settingsRepository: SettingsRepository(),
    );
    await experiments.load();
    addTearDown(apps.close);
    addTearDown(experiments.close);
    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider.value(value: apps),
          BlocProvider.value(value: experiments),
        ],
        child: const AppsPickerEditor(),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Hidden experiments'), findsOneWidget);
    final chat = find.byKey(const ValueKey('chat'));
    await tester.tap(
      find.descendant(of: chat, matching: find.byTooltip('Show app')),
    );
    await tester.pumpAndSettle();
    expect(experiments.state.isEnabled('chat'), isTrue);
    expect(
      tester.getTopLeft(find.text('Chat')).dy,
      lessThan(tester.getTopLeft(find.text('Hidden experiments')).dy),
    );
    final inventory = find.byKey(const ValueKey('inventory'));
    final unavailableShow = find.descendant(
      of: inventory,
      matching: find.byTooltip('Unavailable with current access'),
    );
    expect(unavailableShow, findsOneWidget);
    final showButton = find.descendant(
      of: inventory,
      matching: find.byType(IconButton),
    );
    expect(tester.widget<IconButton>(showButton).onPressed, isNull);
    expect(experiments.state.isEnabled('inventory'), isFalse);
  });
}
