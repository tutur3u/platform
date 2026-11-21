import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/startup/foreground_refresh.dart';
import 'package:mobile/core/ui/components/account_overlay_scope.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_inbox_page.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_today_page.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_work_page.dart';

import '../../../helpers/design_render_harness.dart';
import '../../../helpers/mastermind_fleet_fixture.dart';
import '../../../helpers/mastermind_view_harness.dart';
import '../../../helpers/pump_app.dart';

// Product rule: apps/docs/platform/features/mobile-mastermind.mdx#fleet-sync
void main() {
  setUpAll(() => DesignRender.loadFonts(forGoldens: true));

  late FakeFleetSource source;
  late MastermindViewHarness harness;

  setUp(() async {
    source = FakeFleetSource();
    harness = MastermindViewHarness(
      fleet: FleetCubit(
        source: source,
        newKey: () => 'key-1',
        timer: inertFleetTimer,
      ),
    );
    await harness.setAccess(TestAccess.enabled);
  });

  tearDown(() => harness.dispose());

  Future<void> pump(
    WidgetTester tester,
    Widget page, {
    String theme = 'light',
  }) async {
    DesignRender.setSize(tester, DesignRender.sizes['phone']!);
    final (settings, brightness) = DesignRender.themes[theme]!;
    await tester.pumpWidget(
      DesignRenderApp(
        settings: settings,
        brightness: brightness,
        child: harness.wrap(page),
      ),
    );
    await tester.pump();
    await tester.pump();
  }

  DateTime now() => fleetTestNow;

  testWidgets(
    'Fleet waits for foreground privacy before refreshing or polling',
    (tester) async {
      final allowed = ValueNotifier(false);
      final queued = <Object, VoidCallback>{};
      final unbind = ForegroundRefresh.bind(
        (owner, work) => queued[owner] = work,
      );
      addTearDown(allowed.dispose);
      addTearDown(unbind);
      await tester.setAppLifecycle(AppLifecycleState.resumed);
      await pump(
        tester,
        ValueListenableBuilder(
          valueListenable: allowed,
          builder: (_, open, child) =>
              AccountOverlayScope(epoch: allowed, allowed: open, child: child!),
          child: FleetTodayPage(now: now),
        ),
      );
      expect(source.fetches, 0);
      allowed.value = true;
      await tester.pump();
      expect(source.fetches, 0);
      expect(queued, hasLength(1));
      queued.values.single();
      queued.clear();
      await tester.pump();
      expect(source.fetches, 1);

      await tester.setAppLifecycle(AppLifecycleState.paused);
      allowed.value = false;
      await tester.setAppLifecycle(AppLifecycleState.resumed);
      await tester.pump();
      queued.clear();
      await tester.pump(const Duration(seconds: 30));
      expect(queued, isEmpty);
      expect(source.fetches, 1);

      allowed.value = true;
      await tester.pump();
      queued.values.single();
      queued.clear();
      await tester.pump();
      expect(source.fetches, 2);

      allowed.value = false;
      await tester.pump();
      await tester.pump(const Duration(seconds: 30));
      expect(queued, isEmpty);
      expect(source.fetches, 2);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets('Today shows health, counts, needs-you and machines', (
    tester,
  ) async {
    await pump(tester, FleetTodayPage(now: now));
    expect(find.text('Updated 2 min ago'), findsOneWidget);
    expect(find.text('2 decisions need you'), findsOneWidget);
    expect(find.text('Working'), findsOneWidget);
    expect(find.text('2 of 3'), findsOneWidget);
    expect(find.text('Ship fleet sync to production?'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Macbook M3'), 200);
    expect(find.text('Offline'), findsWidgets);
    expect(find.text('3 active lanes'), findsNothing);
    expect(find.text('5 active lanes'), findsOneWidget);
  });

  testWidgets('a stale snapshot and a failed refresh warn', (tester) async {
    source.json = fleetSampleJson(receivedAt: '2026-11-20T02:40:00.000Z');
    await pump(tester, FleetTodayPage(now: now));
    expect(find.textContaining('publisher may be paused'), findsOneWidget);

    source.fetchError = const ApiException.transport(message: 'offline');
    await harness.runtime.fleet.refresh();
    await tester.pump();
    expect(find.textContaining("Couldn't refresh"), findsOneWidget);
    expect(find.text('Ship fleet sync to production?'), findsOneWidget);
  });

  testWidgets('Inbox approves with the recommended option', (tester) async {
    await pump(tester, FleetInboxPage(now: now));
    expect(find.text('Urgent'), findsOneWidget);
    expect(find.textContaining('Recommended'), findsOneWidget);

    await tester.tap(find.text('Ship now'));
    await tester.pump();
    await tester.pump();
    expect(source.answers.single, containsPair('optionId', 'now'));
    expect(source.answers.single['action'], FleetAnswerAction.approve);
    expect(find.text('Answered'), findsOneWidget);
    expect(find.text('Approved · Waiting for Iris'), findsOneWidget);
  });

  testWidgets('Inbox replies through the sheet and holds', (tester) async {
    await pump(tester, FleetInboxPage(now: now));
    await tester.tap(find.text('Reply').last);
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(EditableText).last, 'Do it Monday');
    await tester.pump();
    await tester.tap(find.text('Send'));
    await tester.pumpAndSettle();
    expect(source.answers.single['text'], 'Do it Monday');
    expect(source.answers.single['decisionId'], 'pool-switch');
  });

  testWidgets('a failed answer offers Retry with the same key', (tester) async {
    source.answerError = const ApiException.transport(message: 'offline');
    await pump(tester, FleetInboxPage(now: now));
    await tester.tap(find.text('Hold').first);
    await tester.pump();
    await tester.pump();
    expect(find.textContaining('retrying in'), findsOneWidget);
    source.answerError = null;
    await tester.tap(find.text('Retry now'));
    await tester.pump();
    await tester.pump();
    expect(source.answers.map((a) => a['key']), ['key-1', 'key-1']);
  });

  testWidgets('Inbox empty state', (tester) async {
    source.json = fleetSampleJson(decisions: const []);
    await pump(tester, FleetInboxPage(now: now));
    expect(find.text('Nothing needs you'), findsOneWidget);
  });

  testWidgets('Work groups by machine or provider and filters by state', (
    tester,
  ) async {
    await pump(tester, FleetWorkPage(now: now));
    expect(find.text('M4 · 6'), findsOneWidget);
    final page = find
        .byWidgetPredicate(
          (w) => w is Scrollable && w.axisDirection == AxisDirection.down,
        )
        .first;
    await tester.scrollUntilVisible(
      find.text('MacStudio1 · 1'),
      200,
      scrollable: page,
    );
    expect(find.text('MacStudio1 · 1'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('By provider'),
      -200,
      scrollable: page,
    );

    await tester.tap(find.text('By provider'));
    await tester.pump();
    expect(find.text('codex · 4'), findsOneWidget);

    final failed = find.textContaining('Failed').first;
    await tester.ensureVisible(failed);
    await tester.pump();
    await tester.tap(failed);
    await tester.pump();
    expect(find.text('Prod migration check'), findsOneWidget);
    expect(find.text('Gateway apex mounts'), findsNothing);
  });

  testWidgets('Work seeds its filter from the URL', (tester) async {
    await pump(
      tester,
      FleetWorkPage(initialState: FleetLaneState.waiting, now: now),
    );
    expect(find.text('Mira channel threads'), findsOneWidget);
    expect(find.text('Docs cleanup'), findsNothing);
  });

  testWidgets('no snapshot yet and unreachable show whole-screen states', (
    tester,
  ) async {
    source.fetchError = const ApiException(message: 'none', statusCode: 404);
    await pump(tester, FleetTodayPage(now: now));
    expect(find.text("The fleet hasn't synced yet"), findsOneWidget);

    source.fetchError = const ApiException.transport(message: 'offline');
    await tester.tap(find.text('Retry'));
    await tester.pump();
    await tester.pump();
    expect(find.text("Can't reach the fleet"), findsOneWidget);
  });

  for (final theme in ['light', 'dark']) {
    testWidgets('renders Today, Inbox and Work in $theme', (tester) async {
      for (final (name, page) in [
        ('today', FleetTodayPage(now: now)),
        ('inbox', FleetInboxPage(now: now)),
        ('work', FleetWorkPage(now: now)),
      ]) {
        await pump(tester, page, theme: theme);
        expect(tester.takeException(), isNull);
        await DesignRender.capture(tester, 'mastermind-fleet/$name-$theme');
      }
    });
  }
}
