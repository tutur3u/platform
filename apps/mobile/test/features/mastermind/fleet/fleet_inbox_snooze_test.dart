import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_snooze_store.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_today_page.dart';

import '../../../helpers/design_render_harness.dart';
import '../../../helpers/fleet_router_harness.dart';
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

  Finder page() => fleetPageScrollable();

  Map<String, dynamic> single() => fleetSampleJson(
    decisions: [
      {
        'id': 'ship-fleet-sync',
        'title': 'Ship fleet sync to production?',
        'body': 'Web endpoints and the publisher are green on main.',
        'urgency': 'urgent',
        'options': [
          {'id': 'now', 'label': 'Ship now'},
          {'id': 'tonight', 'label': 'Tonight'},
        ],
        'recommendedOptionId': 'now',
        'createdAt': '2026-11-20T02:40:00.000Z',
        'deadlineAt': '2026-11-20T10:00:00.000Z',
      },
    ],
  );

  Future<GoRouter> pumpRoutes(WidgetTester tester) =>
      pumpFleetRoutes(tester, harness, now: () => clock);

  // Snooze sits on the decision's own page.
  Future<void> openSnooze(WidgetTester tester) async {
    await tester.tap(find.text('Ship fleet sync to production?'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Snooze'),
      200,
      scrollable: page(),
    );
    await tester.tap(find.text('Snooze'));
    await tester.pumpAndSettle();
  }

  testWidgets('a snoozed card hides, then returns when its time passes', (
    tester,
  ) async {
    await setUpHarness();
    source.json = single();
    await pumpRoutes(tester);
    expect(find.text('Needs you 1'), findsOneWidget);

    await openSnooze(tester);
    expect(find.text('Until 5 min before deadline'), findsOneWidget);
    await tester.tap(find.text('15 minutes'));
    await tester.pumpAndSettle();
    // Back on the Inbox: the card waits under Snoozed and is not counted.
    expect(find.text('Needs you'), findsOneWidget);
    expect(find.text('Snoozed'), findsOneWidget);
    expect(find.textContaining('Back at'), findsOneWidget);
    expect(harness.runtime.fleetSnoozes.state.keys, ['ship-fleet-sync']);

    clock = clock.add(const Duration(minutes: 16));
    await tester.pump(const Duration(seconds: 15));
    expect(find.text('Needs you 1'), findsOneWidget);
    expect(find.text('Snoozed'), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('a snooze that cannot be stored says so and offers Retry', (
    tester,
  ) async {
    final store = _FailingStore();
    await setUpHarness(snoozeStore: store);
    source.json = single();
    await pumpRoutes(tester);
    await openSnooze(tester);
    await tester.tap(find.text('15 minutes'));
    await tester.pumpAndSettle();
    expect(find.text("Couldn't snooze on this device"), findsOneWidget);
    expect(find.textContaining('Snoozed until'), findsNothing);
    // Still on the decision: nothing was snoozed.
    expect(find.text('Snooze'), findsOneWidget);

    store.failing = false;
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Snoozed until'), findsOneWidget);
    expect(harness.runtime.fleetSnoozes.state.keys, ['ship-fleet-sync']);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('Retry on a stale snooze toast after leaving is inert', (
    tester,
  ) async {
    final store = _FailingStore();
    await setUpHarness(snoozeStore: store);
    source.json = single();
    final router = await pumpRoutes(tester);
    await openSnooze(tester);
    await tester.tap(find.text('15 minutes'));
    await tester.pumpAndSettle();
    expect(find.text("Couldn't snooze on this device"), findsOneWidget);
    router.pop();
    await tester.pumpAndSettle();
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
    source.json = single();
    await pumpRoutes(tester);
    await openSnooze(tester);
    await tester.tap(find.text('1 hour'));
    await tester.pumpAndSettle();
    expect(find.text('Needs you'), findsOneWidget);
    await tester.tap(find.text('Undo'));
    await tester.pumpAndSettle();
    expect(find.text('Needs you 1'), findsOneWidget);

    await openSnooze(tester);
    await tester.tap(find.text('Tomorrow 08:00'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Show now'),
      200,
      scrollable: page(),
    );
    await tester.tap(find.text('Show now'));
    await tester.pumpAndSettle();
    expect(find.text('Needs you 1'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('a receipt polled during the undo window keeps Undo', (
    tester,
  ) async {
    await setUpHarness(undoWindow: const Duration(seconds: 5));
    await pumpRoutes(tester);
    unawaited(
      harness.runtime.fleet.answer(
        'ship-fleet-sync',
        FleetAnswerAction.approve,
        optionId: 'now',
      ),
    );
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
    await tester.tap(find.text('History'));
    await tester.pump();
    // This device's own answer, still undoable, wins over the receipt.
    expect(find.text('Ship now'), findsOneWidget);
    expect(find.text('Sending'), findsOneWidget);
    await tester.tap(find.text('Undo'));
    await tester.pump(const Duration(seconds: 6));
    expect(source.answers, isEmpty);
    // With nothing left in flight, the other device's answer shows.
    expect(find.text('On hold'), findsOneWidget);
    expect(find.text('Received by Iris'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('a failed newer answer retries over an older receipt', (
    tester,
  ) async {
    await setUpHarness(undoWindow: const Duration(seconds: 5));
    await pumpRoutes(tester);
    unawaited(
      harness.runtime.fleet.answer(
        'ship-fleet-sync',
        FleetAnswerAction.approve,
        optionId: 'now',
      ),
    );
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
    await tester.tap(find.text('History'));
    await tester.pump();
    expect(find.text('Ship now'), findsOneWidget);
    expect(find.text('Retrying'), findsOneWidget);
    expect(find.text('Received by Iris'), findsNothing);
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
    await pumpRoutes(tester);
    // Asks and sign-in requests share Needs you, most urgent first.
    expect(find.text('Needs you 2'), findsOneWidget);
    expect(find.text('FYI 1'), findsOneWidget);
    expect(find.text('Urgent'), findsOneWidget);
    expect(find.text('Due in 19:00'), findsOneWidget);
    expect(find.text('post-deploy watch'), findsOneWidget);
    expect(
      find.text('Recommended Roll back now', findRichText: true),
      findsOneWidget,
    );
    expect(find.text('Fix forward'), findsNothing);

    await tester.tap(find.text('Roll back the Calendar Worker deploy?'));
    await tester.pumpAndSettle();
    expect(
      find.text('Error rate rose to 4.1% after the promotion.'),
      findsOneWidget,
    );
    await tester.scrollUntilVisible(
      find.text('If no answer'),
      200,
      scrollable: page(),
    );
    expect(find.text('Iris rolls back at the deadline.'), findsOneWidget);
    expect(find.text('Hold'), findsOneWidget);
    expect(find.text('Snooze'), findsOneWidget);
    GoRouter.of(tester.element(find.text('Hold'))).pop();
    await tester.pumpAndSettle();

    await tester.tap(find.text('FYI 1'));
    await tester.pump();
    expect(find.text('Daily CI sample recorded'), findsOneWidget);
    await tester.tap(find.text('History'));
    await tester.pump();
    for (final text in [
      'Retire the Vercel cron?',
      'Retire it',
      'You · WhatsApp',
      'Delivered to Iris',
    ]) {
      expect(find.text(text), findsOneWidget, reason: text);
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
        '3 lanes are running. Main is frozen: Vercel '
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
