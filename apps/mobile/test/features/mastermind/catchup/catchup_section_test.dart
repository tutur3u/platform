import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';

import '../../../helpers/mastermind_catchup_fixture.dart';
import '../../../helpers/mastermind_home_fixture.dart';
import '../../../helpers/mastermind_view_harness.dart';
import '../../../helpers/mastermind_work_pump.dart';

final _visit = DateTime.utc(2026, 1, 31, 16, 15);

Future<(MastermindViewHarness, GoRouter)> _pump(
  WidgetTester tester, {
  Map<String, dynamic>? json,
}) async {
  final router = workRouter(Routes.mastermind);
  final harness = await pumpWork(
    tester,
    json ?? homeWithCatchup(),
    size: const Size(430, 9000),
    router: router,
  );
  return (harness, router);
}

Finder _row(String id) => find.byKey(ValueKey('catchup-row-$id'));
Finder _group(String key) => find.byKey(ValueKey('catchup-group-$key'));

void main() {
  setUpAll(initializeDateFormatting);

  testWidgets('no digest from the hub means no Catch-up section', (
    tester,
  ) async {
    useCatchupSession(lastVisit: _visit);
    await _pump(tester, json: homeJson());
    expect(find.text('Since you last looked'), findsNothing);
    expect(find.byKey(const ValueKey('catchup-button')), findsNothing);
  });

  group('since the last visit', () {
    testWidgets('shows new rows, counts, product names and relative times', (
      tester,
    ) async {
      useCatchupSession(lastVisit: _visit);
      await _pump(tester);
      expect(find.text('Since you last looked'), findsOneWidget);
      expect(find.text('Since your last visit'), findsOneWidget);
      expect(
        tester.widget<Text>(find.byKey(const ValueKey('catchup-counts'))).data,
        '3 need you · 1 shipped · 1 blocked',
      );
      // The hub's name, and the slug when it names none.
      expect(_group('needs_you:upskii'), findsOneWidget);
      expect(find.text('Upskii'), findsWidgets);
      expect(find.text('vector-strike'), findsNothing);
      expect(find.text('Ship Upskii 1.8.2 to production?'), findsOneWidget);
      // Older than the visit: hidden until asked for.
      expect(find.text('Tuturuuu 2.4.0 released'), findsNothing);
      expect(find.text('Show 6 earlier'), findsOneWidget);
      // 17:20 against the 17:32 clock, with the clock glyph.
      expect(find.text('12m'), findsOneWidget);
      expect(find.byIcon(LucideIcons.clock), findsWidgets);
      expect(find.text('Some updates may be missing'), findsOneWidget);
    });

    testWidgets('a neutral item reads "Security update" and nothing else', (
      tester,
    ) async {
      useCatchupSession(lastVisit: _visit);
      final (_, router) = await _pump(tester);
      expect(find.text('Security update'), findsOneWidget);
      expect(find.textContaining('Embargoed'), findsNothing);
      // Not tappable: it has neither an entity nor a link.
      await tester.tap(find.text('Security update'));
      await tester.pumpAndSettle();
      expect(workUri(router).toString(), Routes.mastermind);
    });

    testWidgets('blocked rows show the reason and who is on it', (
      tester,
    ) async {
      useCatchupSession(lastVisit: _visit);
      await _pump(tester);
      expect(find.text('pgTAP caller-scope check fails'), findsOneWidget);
      expect(find.text('Forge is on it'), findsOneWidget);
    });

    testWidgets('Show earlier reveals older rows under the divider', (
      tester,
    ) async {
      useCatchupSession(lastVisit: _visit);
      await _pump(tester);
      await tester.tap(find.text('Show 6 earlier'));
      await tester.pumpAndSettle();
      expect(find.text('Tuturuuu 2.4.0 released'), findsOneWidget);
      expect(find.text('New since your last visit'), findsOneWidget);
      expect(find.textContaining('earlier'), findsNothing);
    });

    testWidgets('quiet: nothing new says so', (tester) async {
      useCatchupSession(lastVisit: DateTime.utc(2026, 1, 31, 17, 31));
      await _pump(tester);
      expect(find.text('Quiet since you last looked'), findsOneWidget);
      expect(_row('n1'), findsNothing);
    });
  });

  testWidgets('first run: welcome, the last day and the hub counts', (
    tester,
  ) async {
    useCatchupSession();
    await _pump(tester);
    expect(
      find.text("Welcome to Mastermind. Here's what happened in the last day."),
      findsOneWidget,
    );
    expect(find.text('Last 24 hours'), findsOneWidget);
    expect(find.text('New since your last visit'), findsNothing);
    expect(
      tester.widget<Text>(find.byKey(const ValueKey('catchup-counts'))).data,
      '3 need you · 3 shipped · 2 blocked · 2 changed',
    );
    expect(find.text('Tuturuuu 2.4.0 released'), findsOneWidget);
    expect(find.text('Rex held Upskii 1.8.1'), findsOneWidget);
  });

  testWidgets('group headers collapse and stay collapsed for the session', (
    tester,
  ) async {
    final session = useCatchupSession();
    await _pump(tester);
    expect(find.text('Ship Upskii 1.8.2 to production?'), findsOneWidget);
    await tester.tap(_group('needs_you:upskii'));
    await tester.pumpAndSettle();
    expect(find.text('Ship Upskii 1.8.2 to production?'), findsNothing);
    expect(session.isCollapsed('needs_you:upskii'), isTrue);
    await tester.tap(_group('needs_you:upskii'));
    await tester.pumpAndSettle();
    expect(find.text('Ship Upskii 1.8.2 to production?'), findsOneWidget);
  });

  group('rows open their target', () {
    testWidgets('ask, lane, env/release and usage stay in the app', (
      tester,
    ) async {
      useCatchupSession();
      final (_, router) = await _pump(tester);
      Future<void> open(String id, String expected) async {
        await tester.ensureVisible(_row(id));
        await tester.tap(_row(id));
        await tester.pumpAndSettle();
        expect(workUri(router).toString(), expected, reason: id);
        router.go(Routes.mastermind);
        await tester.pumpAndSettle();
      }

      await open(
        'n1',
        Routes.mastermindInboxItemPath('item-00000000000000000001'),
      );
      await open('b1', Routes.mastermindWorkLanePath('lane-7'));
      await open('s2', Routes.mastermindShip);
      await open('u1', Routes.mastermindInsights);
    });

    testWidgets('a row with neither is not a button', (tester) async {
      useCatchupSession();
      await _pump(tester);
      final handle = tester.ensureSemantics();
      expect(tester.getSemantics(_row('b2')).flagsCollection.isButton, isFalse);
      expect(tester.getSemantics(_row('n1')).flagsCollection.isButton, isTrue);
      handle.dispose();
    });
  });

  group('time', () {
    testWidgets('a tap on the glyph shows the absolute time in Ho Chi Minh', (
      tester,
    ) async {
      useCatchupSession();
      await _pump(tester);
      await tester.tap(
        find.descendant(
          of: _row('n1'),
          matching: find.byIcon(LucideIcons.clock),
        ),
      );
      await tester.pumpAndSettle();
      // 17:20 UTC is 00:20 the next day in Asia/Ho_Chi_Minh.
      expect(find.text('Feb 1, 00:20 ICT · Asia/Ho_Chi_Minh'), findsOneWidget);
    });
  });

  group('Catch me up', () {
    testWidgets('refetches the snapshot and reports success', (tester) async {
      useCatchupSession(lastVisit: _visit);
      final (harness, _) = await _pump(tester);
      final before = harness.source.calls;
      await tester.tap(find.byKey(const ValueKey('catchup-button')));
      await tester.pumpAndSettle();
      expect(harness.source.calls, before + 1);
      expect(find.text("You're up to date"), findsOneWidget);
      // The note goes away on its own.
      await tester.pump(const Duration(seconds: 5));
      expect(find.text("You're up to date"), findsNothing);
    });

    testWidgets('failure keeps the digest and says so', (tester) async {
      useCatchupSession(lastVisit: _visit);
      final (harness, _) = await _pump(tester);
      harness.source.fetcher = () async =>
          const SnapshotFetch.unavailable(SnapshotUnavailableKind.unavailable);
      await tester.tap(find.byKey(const ValueKey('catchup-button')));
      await tester.pumpAndSettle();
      expect(find.text("Couldn't catch up. Try again."), findsOneWidget);
      expect(find.byKey(const ValueKey('catchup-offline')), findsOneWidget);
      expect(find.text('Ship Upskii 1.8.2 to production?'), findsOneWidget);
    });

    testWidgets('shows progress while it runs', (tester) async {
      useCatchupSession(lastVisit: _visit);
      final (harness, _) = await _pump(tester);
      harness.source.fetcher = () async {
        await Future<void>.delayed(const Duration(seconds: 1));
        return SnapshotFetch.ok(
          harness.source.bytes,
          testNow,
          digest: testDigest,
        );
      };
      await tester.tap(find.byKey(const ValueKey('catchup-button')));
      await tester.pump();
      expect(find.text('Catching up…'), findsOneWidget);
      await tester.pumpAndSettle();
      expect(find.text('Catching up…'), findsNothing);
    });
  });

  testWidgets('large text keeps every title whole', (tester) async {
    useCatchupSession();
    tester.platformDispatcher.textScaleFactorTestValue = 3.1;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await _pump(tester);
    expect(tester.takeException(), isNull);
    expect(find.text('Ship Upskii 1.8.2 to production?'), findsOneWidget);
  });
}
