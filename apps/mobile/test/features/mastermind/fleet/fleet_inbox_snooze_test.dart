import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_snooze_store.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_inbox_page.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_today_page.dart';

import '../../../helpers/design_render_harness.dart';
import '../../../helpers/mastermind_fleet_fixture.dart';
import '../../../helpers/mastermind_view_harness.dart';

// Product rule: apps/docs/platform/features/mobile-mastermind.mdx#fleet-inbox
void main() {
  late FakeFleetSource source;
  late MastermindViewHarness harness;
  late DateTime clock;

  Future<void> setUpHarness({
    Duration undoWindow = Duration.zero,
    FleetSnoozeStore? snoozeStore,
  }) async {
    clock = fleetTestNow;
    source = FakeFleetSource();
    harness = MastermindViewHarness(
      fleet: FleetCubit(
        source: source,
        newKey: () => 'key-1',
        undoWindow: undoWindow,
        timer: inertFleetTimer,
      ),
      fleetSnoozeStore: snoozeStore,
    );
    await harness.setAccess(TestAccess.enabled);
  }

  tearDown(() => harness.dispose());

  Future<void> pump(WidgetTester tester, Widget page) async {
    DesignRender.setSize(tester, DesignRender.sizes['phone']!);
    final (settings, brightness) = DesignRender.themes['light']!;
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

  Finder page() => find
      .byWidgetPredicate(
        (w) => w is Scrollable && w.axisDirection == AxisDirection.down,
      )
      .first;

  testWidgets('a snoozed card hides, then returns when its time passes', (
    tester,
  ) async {
    await setUpHarness();
    await pump(tester, FleetInboxPage(now: () => clock));
    expect(find.text('Ship fleet sync to production?'), findsOneWidget);

    await tester.tap(find.text('Snooze').first);
    await tester.pumpAndSettle();
    expect(find.text('Until 5 min before deadline'), findsOneWidget);
    await tester.tap(find.text('15 minutes'));
    await tester.pumpAndSettle();
    expect(find.text('Ship now'), findsNothing);
    expect(find.text('Snoozed'), findsOneWidget);
    expect(find.textContaining('Back at'), findsOneWidget);
    expect(harness.runtime.fleetSnoozes.state.keys, ['ship-fleet-sync']);

    clock = clock.add(const Duration(minutes: 16));
    await tester.pump(const Duration(seconds: 15));
    expect(find.text('Ship now'), findsOneWidget);
    expect(find.text('Snoozed'), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('a snooze that cannot be stored says so and offers Retry', (
    tester,
  ) async {
    final store = _FailingStore();
    await setUpHarness(snoozeStore: store);
    await pump(tester, FleetInboxPage(now: () => clock));
    await tester.tap(find.text('Snooze').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('15 minutes'));
    await tester.pumpAndSettle();
    expect(find.text("Couldn't snooze on this device"), findsOneWidget);
    expect(find.textContaining('Snoozed until'), findsNothing);
    expect(find.text('Ship now'), findsOneWidget);

    store.failing = false;
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.text('Ship now'), findsNothing);
    expect(find.textContaining('Snoozed until'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('Retry on a stale snooze toast after leaving Inbox is inert', (
    tester,
  ) async {
    final store = _FailingStore();
    await setUpHarness(snoozeStore: store);
    final showInbox = ValueNotifier(true);
    addTearDown(showInbox.dispose);
    DesignRender.setSize(tester, DesignRender.sizes['phone']!);
    final (settings, brightness) = DesignRender.themes['light']!;
    await tester.pumpWidget(
      DesignRenderApp(
        settings: settings,
        brightness: brightness,
        child: harness.wrap(
          ValueListenableBuilder(
            valueListenable: showInbox,
            builder: (_, show, _) => show
                ? FleetInboxPage(now: () => clock)
                : const SizedBox.shrink(),
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
    await tester.tap(find.text('Snooze').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('15 minutes'));
    await tester.pumpAndSettle();
    expect(find.text("Couldn't snooze on this device"), findsOneWidget);
    showInbox.value = false;
    await tester.pump();
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(harness.runtime.fleetSnoozes.state, isEmpty);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('Undo on the snooze toast and Show now bring a card back', (
    tester,
  ) async {
    await setUpHarness();
    await pump(tester, FleetInboxPage(now: () => clock));
    await tester.tap(find.text('Snooze').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('1 hour'));
    await tester.pumpAndSettle();
    expect(find.text('Ship now'), findsNothing);
    await tester.tap(find.text('Undo'));
    await tester.pumpAndSettle();
    expect(find.text('Ship now'), findsOneWidget);

    await tester.tap(find.text('Snooze').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Tomorrow 08:00'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Show now'),
      200,
      scrollable: page(),
    );
    await tester.tap(find.text('Show now'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Ship now'),
      -200,
      scrollable: page(),
    );
    expect(find.text('Ship now'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('a one-tap answer can be undone inside its window', (
    tester,
  ) async {
    await setUpHarness(undoWindow: const Duration(seconds: 5));
    await pump(tester, FleetInboxPage(now: () => clock));
    await tester.tap(find.text('Ship now'));
    await tester.pump();
    expect(find.text('About to send'), findsOneWidget);
    await tester.tap(find.text('Undo'));
    await tester.pump(const Duration(seconds: 6));
    expect(source.answers, isEmpty);
    expect(find.text('Ship now'), findsOneWidget);

    await tester.tap(find.text('Ship now'));
    await tester.pump(const Duration(seconds: 6));
    await tester.pump();
    expect(source.answers.single['optionId'], 'now');
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('a receipt polled during the undo window keeps Undo', (
    tester,
  ) async {
    await setUpHarness(undoWindow: const Duration(seconds: 5));
    await pump(tester, FleetInboxPage(now: () => clock));
    await tester.tap(find.text('Ship now'));
    await tester.pump();
    source.json = fleetSampleJson(
      answers: {
        'ship-fleet-sync': {
          'action': 'hold',
          'revision': 1,
          'answeredAt': '2026-11-20T03:01:00.000Z',
          'pickedUp': true,
        },
      },
    );
    await harness.runtime.fleet.refresh();
    await tester.pump();
    expect(find.text('About to send'), findsOneWidget);
    // The card keeps its place in Urgent instead of moving to Answered.
    expect(find.text('Answered'), findsNothing);
    await tester.tap(find.text('Undo'));
    await tester.pump(const Duration(seconds: 6));
    expect(source.answers, isEmpty);
    expect(find.textContaining('On hold'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('a failed newer answer shows Retry over an older receipt', (
    tester,
  ) async {
    await setUpHarness(undoWindow: const Duration(seconds: 5));
    await pump(tester, FleetInboxPage(now: () => clock));
    await tester.tap(find.text('Ship now'));
    await tester.pump();
    source
      ..answerError = const ApiException.transport(message: 'offline')
      ..json = fleetSampleJson(
        answers: {
          'ship-fleet-sync': {
            'action': 'hold',
            'revision': 1,
            'answeredAt': '2026-11-20T03:01:00.000Z',
            'pickedUp': true,
          },
        },
      );
    await harness.runtime.fleet.refresh();
    await tester.pump(const Duration(seconds: 6));
    await tester.pump();
    expect(find.textContaining('retrying in'), findsOneWidget);
    expect(find.text('Retry now'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('tiers, context rows and answers from other channels', (
    tester,
  ) async {
    await setUpHarness();
    source.json = fleetSampleJson(
      decisions: [
        {
          'id': 'rollback',
          'title': 'Roll back the Calendar Worker deploy?',
          'why': 'Error rate rose to 4.1% after the promotion.',
          'defaultOutcome': 'Iris rolls back at the deadline.',
          'requester': 'post-deploy watch',
          'urgency': 'urgent',
          'options': [
            {'id': 'now', 'label': 'Roll back now'},
            {'id': 'fix', 'label': 'Fix forward'},
          ],
          'recommendedOptionId': 'now',
          'createdAt': '2026-11-20T02:58:00.000Z',
          'deadlineAt': '2026-11-20T03:21:00.000Z',
        },
        fleetLoginJson(),
        {
          'id': 'ci',
          'title': 'Daily CI sample recorded',
          'urgency': 'fyi',
          'createdAt': '2026-11-20T02:58:00.000Z',
        },
      ],
      resolved: [
        {
          'id': 'cron',
          'title': 'Retire the Vercel cron?',
          'answeredVia': 'whatsapp',
          'outcome': 'Retire it',
          'resolvedAt': '2026-11-20T02:11:00.000Z',
        },
      ],
    );
    await pump(tester, FleetInboxPage(now: () => clock));
    expect(find.text('Urgent'), findsOneWidget);
    expect(find.text('Due in 19:00'), findsOneWidget);
    expect(find.text('Why'), findsWidgets);
    expect(find.text('If no answer'), findsOneWidget);
    expect(find.text('post-deploy watch'), findsOneWidget);
    expect(find.text('Roll back now'), findsOneWidget);
    expect(find.text('Fix forward'), findsNothing);
    await tester.tap(find.text('More'));
    await tester.pump();
    expect(find.text('Fix forward'), findsOneWidget);
    expect(find.text('Hold'), findsOneWidget);

    for (final text in [
      'Access requests',
      'For your information',
      'Answered on WhatsApp · Retire it',
    ]) {
      await tester.scrollUntilVisible(find.text(text), 200, scrollable: page());
      expect(find.text(text), findsOneWidget);
    }
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('Today digests the fleet and shows the release train', (
    tester,
  ) async {
    await setUpHarness();
    source.json = fleetSampleJson(
      decisions: [fleetLoginJson()],
      release: {
        'main': {'state': 'frozen', 'reason': 'Vercel retirement', 'queued': 3},
        'production': {'state': 'healthy', 'sha': 'abc1234'},
        'migrations': {'pending': 1, 'state': 'gated'},
        'incidents': <Map<String, dynamic>>[],
      },
    );
    await pump(tester, FleetTodayPage(now: () => clock));
    expect(
      find.text(
        '3 lanes are running. 1 lane failed. Main is frozen: Vercel '
        'retirement. 3 commits are queued behind it. One login is blocking '
        'work: GitHub on MacStudio1.',
      ),
      findsOneWidget,
    );
    expect(find.text('Blocked on login'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Frozen'),
      200,
      scrollable: page(),
    );
    expect(find.text('Healthy'), findsOneWidget);
    expect(find.text('1 pending'), findsOneWidget);
    expect(find.text('Production gated'), findsOneWidget);
    expect(find.text('None open'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}

class _FailingStore implements FleetSnoozeStore {
  bool failing = true;
  Map<String, DateTime> _saved = const {};

  @override
  String? get scope => 'u1';

  @override
  Future<Map<String, DateTime>> read() async {
    if (failing) throw StateError('storage unavailable');
    return _saved;
  }

  @override
  Future<void> write(Map<String, DateTime> snoozes) async => _saved = snoozes;
}
