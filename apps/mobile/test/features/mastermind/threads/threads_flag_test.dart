import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/mastermind_module.dart';
import 'package:mobile/features/mastermind/threads/mastermind_threads_page.dart';
import 'package:mobile/features/mastermind/threads/threads_models.dart';
import 'package:mobile/features/mastermind/view/work/mastermind_work_page.dart';
import 'package:mobile/features/mastermind/view/work/work_backlog_section.dart';
import 'package:mobile/l10n/gen/app_localizations_en.dart';

import '../../../helpers/mastermind_view_harness.dart';
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

void main() {
  setUpAll(initializeDateFormatting);
  final work = mastermindModule.miniAppNavItems.singleWhere(
    (item) => item.id == 'mastermind_work',
  );

  group('flag off (default)', () {
    test('both flags default off', () {
      expect(mastermindThreadsEnabled, isFalse);
      expect(mastermindThreadHistoryEnabled, isFalse);
    }, skip: mastermindThreadsEnabled);

    test('the Work tab keeps its route, icon and label', () {
      expect(work.route, Routes.mastermindWork);
      expect(work.icon, LucideIcons.briefcase);
      expect(work.label(AppLocalizationsEn()), 'Work');
    }, skip: mastermindThreadsEnabled);

    for (final location in [
      '/mastermind/threads',
      '/mastermind/threads?segment=backlog',
      '/mastermind/threads/item-cccccccccccccccccccc',
    ]) {
      testWidgets('$location falls back to Work', (tester) async {
        final router = await _pumpRouter(tester, location);
        expect(workUri(router).path, Routes.mastermindWork);
        expect(find.byType(MastermindThreadsPage), findsNothing);
        expect(find.byType(MastermindWorkPage), findsOneWidget);
        expect(find.text('Lanes'), findsOneWidget);
        expect(find.text('[Atlas] Mastermind'), findsOneWidget);
      }, skip: mastermindThreadsEnabled);
    }

    testWidgets('Work stays Work', (tester) async {
      final router = await _pumpRouter(tester, Routes.mastermindWork);
      expect(workUri(router).path, Routes.mastermindWork);
      expect(find.byType(MastermindWorkPage), findsOneWidget);
      expect(find.byType(MastermindThreadsPage), findsNothing);
    }, skip: mastermindThreadsEnabled);
  });

  // Run with --dart-define=MASTERMIND_THREADS=true.
  group('flag on', () {
    test('Threads replaces the Work tab', () {
      expect(work.route, '/mastermind/threads');
      expect(work.label(AppLocalizationsEn()), 'Threads');
    }, skip: !mastermindThreadsEnabled);

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
    }, skip: !mastermindThreadsEnabled);

    testWidgets('status chips write the URL; history needs its own flag', (
      tester,
    ) async {
      final router = await _pumpRouter(
        tester,
        '/mastermind/threads/item-cccccccccccccccccccc',
      );
      expect(workUri(router).toString(), '/mastermind/threads');
      await tester.tap(find.text('1 idle'));
      await tester.pumpAndSettle();
      expect(workUri(router).toString(), '/mastermind/threads?state=idle');
      expect(find.text('[Atlas] Mastermind'), findsOneWidget);
    }, skip: !mastermindThreadsEnabled || mastermindThreadHistoryEnabled);
  });
}
