import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/view/apps_hub_page.dart';
import 'package:mobile/features/apps/widgets/app_launcher_pins.dart';
import 'package:mobile/features/settings/cubit/experimental_apps_cubit.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/helpers.dart';

const _pinnable = [
  'tasks',
  'calendar',
  'finance',
  'notes',
  'drive',
  'documents',
  'cms',
  'timer',
  'crm',
];

final Finder _headerAdd = find.byKey(const ValueKey('pinned-add-header'));
final Finder _inlineAdd = find.byKey(const ValueKey('pinned-add-tile'));

Finder _pin(String id) => find.byKey(ValueKey('pinned-$id'));

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

  Future<List<String>> mountPins(
    WidgetTester tester, {
    required int count,
    Size size = const Size(390, 844),
    VoidCallback? onManage,
  }) async {
    final ids = _pinnable.take(count).toList();
    for (final id in ids) {
      await experiments.setModuleEnabled(moduleId: id, enabled: true);
      await tabs.setAppPinned(id, pinned: true);
    }
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = size;
    addTearDown(tester.view.reset);
    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider.value(value: tabs),
          BlocProvider.value(value: experiments),
        ],
        child: Scaffold(body: AppsHubPage(onManage: onManage ?? () {})),
      ),
    );
    await tester.pumpAndSettle();
    return ids;
  }

  double rowCenter(WidgetTester tester, List<Finder> row) =>
      (tester.getTopLeft(row.first).dx + tester.getTopRight(row.last).dx) / 2;

  test('columns follow the available width', () {
    expect(AppLauncherPins.columnsFor(358), 5);
    expect(AppLauncherPins.columnsFor(786), AppLauncherPins.maxColumns);
    expect(AppLauncherPins.columnsFor(0), 1);
    expect(
      AppLauncherPins.columnsFor(358, textScaler: const TextScaler.linear(2)),
      2,
    );
  });

  testWidgets('a full first row moves Add pin into the section header', (
    tester,
  ) async {
    var managed = 0;
    final ids = await mountPins(tester, count: 5, onManage: () => managed++);
    expect(_inlineAdd, findsNothing);
    expect(_headerAdd, findsOneWidget);
    expect(
      tester.getCenter(_headerAdd).dy,
      lessThan(tester.getTopLeft(_pin(ids.first)).dy),
    );
    expect(tester.getSize(_headerAdd).height, greaterThanOrEqualTo(44));
    final top = tester.getTopLeft(_pin(ids.first)).dy;
    for (final id in ids) {
      expect(tester.getTopLeft(_pin(id)).dy, top);
    }
    await tester.tap(_headerAdd);
    expect(managed, 1);
  });

  testWidgets('a partial row keeps Add pin inline and centred', (tester) async {
    final ids = await mountPins(tester, count: 3);
    expect(_headerAdd, findsNothing);
    expect(_inlineAdd, findsOneWidget);
    final top = tester.getTopLeft(_pin(ids.first)).dy;
    expect(tester.getTopLeft(_inlineAdd).dy, top);
    expect(
      tester.getTopLeft(_inlineAdd).dx,
      greaterThan(tester.getTopLeft(_pin(ids.last)).dx),
    );
    expect(
      rowCenter(tester, [_pin(ids.first), _inlineAdd]),
      moreOrLessEquals(390 / 2, epsilon: 1),
    );
  });

  for (final (size, columns) in [
    (const Size(390, 844), 5),
    (const Size(834, 1194), AppLauncherPins.maxColumns),
  ]) {
    testWidgets('pins lay out $columns even columns at $size', (tester) async {
      final ids = await mountPins(tester, count: _pinnable.length, size: size);
      final firstRow = [for (final id in ids.take(columns)) _pin(id)];
      final top = tester.getTopLeft(firstRow.first).dy;
      for (final pin in firstRow) {
        expect(tester.getTopLeft(pin).dy, top);
      }
      expect(tester.getTopLeft(_pin(ids[columns])).dy, greaterThan(top));
      final slot = tester.getSize(firstRow.first).width;
      for (final (index, pin) in firstRow.indexed.skip(1)) {
        expect(
          tester.getTopLeft(pin).dx - tester.getTopLeft(firstRow.first).dx,
          moreOrLessEquals(slot * index, epsilon: 0.5),
        );
      }
      // Both the full first row and the partial last row are centred.
      final lastRow = [for (final id in ids.skip(columns)) _pin(id)];
      expect(
        rowCenter(tester, firstRow),
        moreOrLessEquals(size.width / 2, epsilon: 1),
      );
      expect(
        rowCenter(tester, lastRow),
        moreOrLessEquals(size.width / 2, epsilon: 1),
      );
      expect(_inlineAdd, findsNothing);
      expect(_headerAdd, findsOneWidget);
    });
  }
}
