import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/features/mastermind/mastermind_module.dart';
import 'package:mobile/features/mastermind/threads/mastermind_threads_page.dart';
import 'package:mobile/features/mastermind/threads/threads_flag.dart';
import 'package:mobile/features/mastermind/view/work/mastermind_work_page.dart';
import 'package:mobile/features/mastermind/view/work/work_backlog_section.dart';
import 'package:mobile/l10n/gen/app_localizations_en.dart';
import 'package:mobile/l10n/gen/app_localizations_vi.dart';

import '../../../helpers/mastermind_view_harness.dart';
import '../../../helpers/mastermind_work_fixture.dart';
import '../../../helpers/mastermind_work_pump.dart';

final _fixture = File('test/fixtures/mastermind/forge_v1_redacted.json');

Future<GoRouter> _pumpRouter(WidgetTester tester, String initial) async {
  final router = workRouter(initial);
  await pumpWork(
    tester,
    const {},
    router: router,
    source: FakeHubSource(bytes: _fixture.readAsBytesSync()),
  );
  return router;
}

/// The dock items the module shows under the current flag.
Future<List<MiniAppNavItem>> _visibleItems(WidgetTester tester) async {
  late List<MiniAppNavItem> items;
  await tester.pumpWidget(
    Builder(
      builder: (context) {
        items = mastermindModule.miniAppNavItemsFor(context);
        return const SizedBox();
      },
    ),
  );
  return items;
}

void main() {
  setUpAll(initializeDateFormatting);
  tearDown(() => debugOverrideMastermindThreads(enabled: null));

  test('the flag defaults to off in a default build', () {
    debugOverrideMastermindThreads(enabled: null);
    expect(mastermindThreadsEnabled, isFalse);
  });

  group('flag off (default)', () {
    setUp(() => debugOverrideMastermindThreads(enabled: false));

    testWidgets('the Work tab keeps its route and label', (tester) async {
      final items = await _visibleItems(tester);
      final work = items.singleWhere((item) => item.id == 'mastermind_work');
      expect(items.any((item) => item.id == 'mastermind_threads'), isFalse);
      expect(work.route, Routes.mastermindWork);
      expect(work.label(AppLocalizationsEn()), 'Work');
    });

    for (final location in [
      '/mastermind/threads',
      '/mastermind/threads?segment=backlog',
    ]) {
      testWidgets('$location falls back to Work', (tester) async {
        final router = await _pumpRouter(tester, location);
        expect(workUri(router).path, Routes.mastermindWork);
        expect(find.byType(MastermindThreadsPage), findsNothing);
        expect(find.byType(MastermindWorkPage), findsOneWidget);
        expect(find.text('Lanes'), findsOneWidget);
        expect(find.text('[Atlas] Mastermind'), findsOneWidget);
      });
    }

    testWidgets('Work stays Work', (tester) async {
      final router = await _pumpRouter(tester, Routes.mastermindWork);
      expect(workUri(router).path, Routes.mastermindWork);
      expect(find.byType(MastermindThreadsPage), findsNothing);
    });

    testWidgets('the lane-gone state says Back to Work', (tester) async {
      final router = workRouter(Routes.mastermindWorkLanePath(laneId(9)));
      await pumpWork(tester, workJson([workLane(1)]), router: router);
      expect(find.text('Back to Work'), findsOneWidget);
      expect(find.text('Back to Threads'), findsNothing);
    });

    testWidgets('a lane location highlights Work in the dock', (tester) async {
      final items = await _visibleItems(tester);
      final selected = miniNavSelectedIndex(
        Routes.mastermindWorkLanePath(laneId(1)),
        items,
      );
      expect(items[selected].id, 'mastermind_work');
    });
  });

  group('flag on', () {
    setUp(() => debugOverrideMastermindThreads(enabled: true));

    testWidgets('Threads replaces the Work tab', (tester) async {
      final items = await _visibleItems(tester);
      final threads = items.singleWhere(
        (item) => item.id == 'mastermind_threads',
      );
      expect(items.any((item) => item.id == 'mastermind_work'), isFalse);
      expect(threads.route, '/mastermind/threads');
      expect(threads.label(AppLocalizationsEn()), 'Threads');
      expect(threads.label(AppLocalizationsVi()), 'Hội thoại');
    });

    testWidgets('opening a lane from Threads keeps the Threads tab selected', (
      tester,
    ) async {
      final items = await _visibleItems(tester);
      String selected(String location) =>
          items[miniNavSelectedIndex(location, items)].id;
      expect(selected('/mastermind/threads'), 'mastermind_threads');
      expect(
        selected(Routes.mastermindWorkLanePath(laneId(1))),
        'mastermind_threads',
      );
      // The other tabs are untouched.
      expect(selected(Routes.mastermind), 'mastermind_home');
      expect(selected(Routes.mastermindInbox), 'mastermind_inbox');
      expect(selected(Routes.mastermindShip), 'mastermind_ship');
      expect(selected(Routes.mastermindInsights), 'mastermind_insights');
    });

    testWidgets('a Work link opens Threads on the same segment', (
      tester,
    ) async {
      final router = await _pumpRouter(
        tester,
        '${Routes.mastermindWork}?segment=backlog',
      );
      expect(workUri(router).toString(), '/mastermind/threads?segment=backlog');
      expect(find.byType(MastermindThreadsPage), findsOneWidget);
      expect(find.byType(WorkBacklogSection), findsOneWidget);
    });

    testWidgets('a Work link keeps its state, product and area filters', (
      tester,
    ) async {
      final router = workRouter(
        '${Routes.mastermindWork}?state=failed&product=Mastermind&area=finance',
      );
      await pumpWork(
        tester,
        workJson([
          workLane(
            1,
            state: 'failed',
            title: 'Broken',
            product: 'Mastermind',
            area: 'finance',
          ),
          workLane(2, title: 'Other', area: 'infra'),
        ]),
        router: router,
      );
      expect(workUri(router).path, '/mastermind/threads');
      final page = tester.widget<MastermindThreadsPage>(
        find.byType(MastermindThreadsPage),
      );
      expect(page.initialState?.wireName, 'failed');
      expect(page.initialProduct?.wireName, 'Mastermind');
      expect(page.initialArea?.wireName, 'finance');
    });

    testWidgets('the lane-gone state says Back to Threads', (tester) async {
      final router = workRouter(Routes.mastermindWorkLanePath(laneId(9)));
      await pumpWork(tester, workJson([workLane(1)]), router: router);
      expect(find.text('Back to Threads'), findsOneWidget);
      expect(find.text('Back to Work'), findsNothing);
      await tester.tap(find.text('Back to Threads'));
      await tester.pumpAndSettle();
      expect(workUri(router).path, '/mastermind/threads');
    });
  });
}
