import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/appearance/appearance_contrast.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/apps/view/apps_hub_page.dart';
import 'package:mobile/features/apps/widgets/app_launcher_tile.dart';
import 'package:mobile/features/apps/widgets/apps_picker_editor.dart';
import 'package:mobile/features/inventory/cubit/inventory_access_cubit.dart';
import 'package:mobile/features/settings/cubit/experimental_apps_cubit.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/helpers.dart';

class _Inventory extends MockCubit<InventoryAccessState>
    implements InventoryAccessCubit {}

Finder section(String id) => find.byKey(ValueKey('apps-section-$id'));

Finder tile(String sectionId, String appId) => find.descendant(
  of: section(sectionId),
  matching: find.byKey(
    ValueKey(
      '${switch (sectionId) {
        'pinned' || 'recent' || 'results' || 'hidden' => sectionId,
        _ => 'app',
      }}-$appId',
    ),
  ),
);

class _FailingPinSettings extends SettingsRepository {
  @override
  Future<void> setPinnedApps(List<String> ids) async {
    throw StateError('Could not save pinned apps');
  }
}

void main() {
  late AppTabCubit tabs;
  late ExperimentalAppsCubit experiments;

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    final settings = SettingsRepository();
    tabs = AppTabCubit(settingsRepository: settings);
    experiments = ExperimentalAppsCubit(settingsRepository: settings);
  });
  tearDown(() async {
    await tabs.close();
    await experiments.close();
  });

  Future<void> mount(
    WidgetTester tester,
    Widget body, {
    Size size = const Size(390, 844),
    double clearance = 0,
  }) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = size
      ..padding = FakeViewPadding(bottom: clearance);
    addTearDown(tester.view.reset);
    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider.value(value: tabs),
          BlocProvider.value(value: experiments),
        ],
        child: Scaffold(body: body),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('shows core apps in categories and opens an accessible tile', (
    tester,
  ) async {
    String? selected;
    await mount(tester, AppsHubPage(onSelected: (app) => selected = app.id));
    expect(find.text('Work'), findsOneWidget);
    expect(find.text('Money'), findsOneWidget);
    expect(find.text('Learning'), findsNothing);
    expect(tile('work', 'tasks'), findsOneWidget);
    expect(tile('work', 'calendar'), findsOneWidget);
    expect(tile('money', 'finance'), findsOneWidget);
    expect(find.byType(AppLauncherTile), findsNWidgets(3));
    expect(
      tester.getTopLeft(tile('work', 'tasks')).dy,
      tester.getTopLeft(tile('work', 'calendar')).dy,
    );

    final semantics = tester.ensureSemantics();
    expect(
      tester
          .getSemantics(find.text('Tasks'))
          .getSemanticsData()
          .flagsCollection
          .isButton,
      isTrue,
    );
    expect(
      tester.getSize(tile('work', 'tasks')).height,
      greaterThanOrEqualTo(44),
    );
    await tester.tap(find.text('Tasks'));
    expect(selected, 'tasks');
    semantics.dispose();
  });

  for (final (size, columns) in [
    (const Size(390, 844), 2),
    (const Size(834, 1194), 3),
  ]) {
    testWidgets('lays out $columns columns at $size', (tester) async {
      await experiments.setModuleEnabled(moduleId: 'documents', enabled: true);
      await mount(tester, const AppsHubPage(), size: size);
      final work = find.descendant(
        of: section('work'),
        matching: find.byType(AppLauncherTile),
      );
      final firstRow = tester.getTopLeft(work.first).dy;
      expect(tester.getTopLeft(work.at(columns - 1)).dy, firstRow);
      if (columns == 2) {
        expect(tester.getTopLeft(work.at(2)).dy, greaterThan(firstRow));
      }
    });
  }

  testWidgets('lists pins and recents in order and omits hidden apps', (
    tester,
  ) async {
    await tabs.setAppPinned('calendar', pinned: true);
    await tabs.setAppPinned('tasks', pinned: true);
    for (final id in ['tasks', 'finance', 'calendar']) {
      await tabs.select(AppRegistry.moduleById(id)!);
    }
    await tabs.setAppHidden('tasks', hidden: true);
    await mount(tester, const AppsHubPage());
    expect(tile('pinned', 'calendar'), findsOneWidget);
    expect(tile('pinned', 'tasks'), findsNothing);
    expect(tile('work', 'tasks'), findsNothing);
    expect(tile('recent', 'tasks'), findsNothing);
    expect(
      tester.getTopLeft(tile('recent', 'calendar')).dx,
      lessThan(tester.getTopLeft(tile('recent', 'finance')).dx),
    );
  });

  testWidgets('disabled and access-denied shortcuts stay out of results', (
    tester,
  ) async {
    final inventory = _Inventory();
    addTearDown(inventory.close);
    whenListen(
      inventory,
      const Stream<InventoryAccessState>.empty(),
      initialState: const InventoryAccessState(
        status: InventoryAccessStatus.loaded,
      ),
    );
    await experiments.setModuleEnabled(moduleId: 'inventory', enabled: true);
    await experiments.setModuleEnabled(moduleId: 'chat', enabled: true);
    for (final id in ['chat', 'inventory']) {
      await tabs.setAppPinned(id, pinned: true);
      await tabs.select(AppRegistry.moduleById(id)!);
    }
    await mount(
      tester,
      BlocProvider<InventoryAccessCubit>.value(
        value: inventory,
        child: const AppsHubPage(query: '  CHAT  '),
      ),
    );
    expect(tile('results', 'chat'), findsOneWidget);
    expect(section('pinned'), findsNothing);
    expect(section('recent'), findsNothing);
    await experiments.setModuleEnabled(moduleId: 'chat', enabled: false);
    await tester.pumpAndSettle();
    expect(find.text('No matching apps'), findsOneWidget);

    await mount(tester, const AppsHubPage());
    expect(section('pinned'), findsNothing);
    expect(section('recent'), findsNothing);
    expect(section('communication'), findsNothing);
    expect(tile('money', 'inventory'), findsNothing);
    await mount(tester, const AppsHubPage(query: 'inventory'));
    expect(find.text('No matching apps'), findsOneWidget);
  });

  for (final (query, id, label) in [
    ('  LiCh  ', 'calendar', 'Lịch'),
    ('tai chinh', 'finance', 'Tài chính'),
    ('Ta\u0300i chi\u0301nh', 'finance', 'Tài chính'),
  ]) {
    testWidgets('Vietnamese Apps search finds $label for $query', (
      tester,
    ) async {
      tester.platformDispatcher.localesTestValue = const [Locale('vi')];
      addTearDown(tester.platformDispatcher.clearLocalesTestValue);
      await mount(tester, AppsHubPage(query: query));
      expect(tile('results', id), findsOneWidget);
      expect(find.text(label), findsOneWidget);
    });
  }

  for (final brightness in Brightness.values) {
    testWidgets('Classic product icons use distinct AA tones in $brightness', (
      tester,
    ) async {
      const ids = [
        'tasks',
        'finance',
        'calendar',
        'documents',
        'chat',
        'crm',
        'notes',
      ];
      await tester.pumpThemedHome(
        Scaffold(
          body: Row(
            children: [
              for (final id in ids)
                AppProductIcon(
                  key: ValueKey(id),
                  module: AppRegistry.moduleById(id)!,
                ),
            ],
          ),
        ),
        brightness: brightness,
      );
      final inks = <Color>{};
      for (final id in ids) {
        final product = find.byKey(ValueKey(id));
        final ink = tester
            .widget<Icon>(
              find.descendant(of: product, matching: find.byType(Icon)),
            )
            .color!;
        final fill =
            (tester
                        .widget<DecoratedBox>(
                          find.descendant(
                            of: product,
                            matching: find.byType(DecoratedBox),
                          ),
                        )
                        .decoration
                    as BoxDecoration)
                .color!;
        expect(
          AppearanceContrast.ratio(ink, fill),
          greaterThanOrEqualTo(AppearanceContrast.aaText),
          reason: id,
        );
        inks.add(ink);
      }
      expect(inks, hasLength(ids.length));
    });
  }

  testWidgets('hidden apps can still be found by description', (tester) async {
    await tabs.setAppHidden('calendar', hidden: true);
    await mount(tester, const AppsHubPage(query: 'Upcoming events'));
    expect(tile('hidden', 'calendar'), findsOneWidget);
    expect(find.text('Hidden apps'), findsOneWidget);
  });

  testWidgets('the last tile scrolls above shell-published dock clearance', (
    tester,
  ) async {
    const clearance = 122.0;
    const size = Size(390, 430);
    await mount(tester, const AppsHubPage(), size: size, clearance: clearance);
    final scroll = tester.state<ScrollableState>(find.byType(Scrollable));
    expect(scroll.position.maxScrollExtent, greaterThan(0));
    scroll.position.jumpTo(scroll.position.maxScrollExtent);
    await tester.pumpAndSettle();
    expect(
      tester.getBottomLeft(tile('money', 'finance')).dy,
      lessThanOrEqualTo(size.height - clearance - AppLayout.scrollEndGap),
    );
  });

  testWidgets('Customize pins, reorders, hides and restores apps', (
    tester,
  ) async {
    await mount(tester, const AppsPickerEditor());
    await tester.tap(find.byTooltip('Pin Tasks'));
    await tester.pumpAndSettle();
    expect(tabs.state.pinnedAppIds, ['tasks']);
    await tester.tap(find.byTooltip('Unpin Tasks'));
    await tester.pumpAndSettle();
    expect(tabs.state.pinnedAppIds, isEmpty);

    final task = find.byKey(const ValueKey('tasks'));
    final calendar = find.byKey(const ValueKey('calendar'));
    final finance = find.byKey(const ValueKey('finance'));
    expect(
      tester.getTopLeft(find.text('Work')).dy,
      lessThan(tester.getTopLeft(task).dy),
    );
    expect(
      tester.getTopLeft(find.text('Money')).dy,
      lessThan(tester.getTopLeft(finance).dy),
    );
    expect(
      find.descendant(of: finance, matching: find.byTooltip('Drag to reorder')),
      findsNothing,
    );
    final workList = find.ancestor(
      of: task,
      matching: find.byType(SliverReorderableList),
    );
    expect(find.descendant(of: workList, matching: calendar), findsOneWidget);
    expect(find.descendant(of: workList, matching: finance), findsNothing);
    final handle = tester.getCenter(
      find.descendant(
        of: calendar,
        matching: find.byTooltip('Drag to reorder'),
      ),
    );
    final distance = tester.getCenter(task).dy - handle.dy;
    final drag = await tester.startGesture(handle);
    for (var step = 0; step < 4; step++) {
      await drag.moveBy(Offset(0, distance / 4));
      await tester.pump();
    }
    await drag.up();
    await tester.pumpAndSettle();
    expect(tabs.state.appOrder.take(2), ['calendar', 'tasks']);
    expect(
      tester.getTopLeft(calendar).dy,
      lessThan(tester.getTopLeft(task).dy),
    );

    await tester.tap(
      find.descendant(of: task, matching: find.byTooltip('Hide app')),
    );
    await tester.pumpAndSettle();
    expect(find.text('Hide this app?'), findsOneWidget);
    expect(tabs.state.hiddenAppIds, isEmpty);
    await tester.tap(find.widgetWithText(AppButton, 'Hide app'));
    await tester.pumpAndSettle();
    expect(tabs.state.hiddenAppIds, ['tasks']);
    expect(
      tester.getTopLeft(find.text('Hidden apps')).dy,
      greaterThan(tester.getTopLeft(find.text('Finance')).dy),
    );
    await tester.tap(
      find.descendant(of: task, matching: find.byTooltip('Show app')),
    );
    await tester.pumpAndSettle();
    expect(tabs.state.hiddenAppIds, isEmpty);

    await mount(tester, const AppsHubPage());
    expect(
      tester.getTopLeft(tile('work', 'calendar')).dx,
      lessThan(tester.getTopLeft(tile('work', 'tasks')).dx),
    );
  });

  testWidgets(
    'Customize reports a pin write failure without changing its state',
    (tester) async {
      await tabs.close();
      tabs = AppTabCubit(settingsRepository: _FailingPinSettings());
      await mount(tester, const AppsPickerEditor());
      await tester.tap(find.byTooltip('Pin Tasks'));
      await tester.pumpAndSettle();

      expect(find.text("Couldn't save pins. Try again."), findsOneWidget);
      expect(find.byTooltip('Pin Tasks'), findsOneWidget);
      expect(tabs.state.pinnedAppIds, isEmpty);
      await tester.pump(const Duration(seconds: 4));
      await tester.pumpAndSettle();
    },
  );

  testWidgets('Customize enables only accessible experiments', (tester) async {
    await mount(tester, const AppsPickerEditor(), size: const Size(430, 2400));
    expect(find.text('Hidden experiments'), findsOneWidget);
    final chat = find.byKey(const ValueKey('chat'));
    await tester.tap(
      find.descendant(of: chat, matching: find.byTooltip('Show app')),
    );
    await tester.pumpAndSettle();
    expect(experiments.state.isEnabled('chat'), isTrue);
    final inventory = find.descendant(
      of: find.byKey(const ValueKey('inventory')),
      matching: find.byType(AppIconButton),
    );
    expect(tester.widget<AppIconButton>(inventory).onPressed, isNull);
    expect(experiments.state.isEnabled('inventory'), isFalse);
  });
}
