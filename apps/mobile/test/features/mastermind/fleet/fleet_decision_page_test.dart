import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/fleet_router_harness.dart';
import '../../../helpers/mastermind_fleet_fixture.dart';
import '../../../helpers/mastermind_view_harness.dart';

const _body =
    'Fysh redesign, drawn in its own design system:\n\n'
    '- home with a real banner carousel;\n'
    '- a fysh-branded sign-in page;\n'
    '- banner editors with drafts and versions.\n\n'
    '**Approve all as recommended** keeps the carousel still.';

Map<String, dynamic> _fysh() => {
  'id': 'fysh-revamp',
  'title': 'Fysh revamp mockups: approve?',
  'body': _body,
  'urgency': 'high',
  'requester': 'Iris',
  'options': [
    {
      'id': 'all',
      'label': 'Approve all as recommended',
      'description': 'Iris builds all four screens today.',
    },
    {
      'id': 'auto',
      'label': 'Approve with auto-advance carousel',
      'description': 'Same, but the carousel advances on its own.',
    },
    {'id': 'changes', 'label': 'Changes needed'},
  ],
  'recommendedOptionId': 'all',
  'createdAt': '2026-11-20T02:40:00.000Z',
};

Map<String, dynamic> _second() => {
  'id': 'pool-switch',
  'title': 'Move the M4 lanes to the second pool?',
  'urgency': 'normal',
  'createdAt': '2026-11-20T02:50:00.000Z',
};

// Product rule: apps/docs/platform/features/mobile-mastermind.mdx#fleet-inbox
void main() {
  late FakeFleetSource source;
  late MastermindViewHarness harness;

  Future<void> setUpHarness({Duration undoWindow = Duration.zero}) async {
    SharedPreferences.setMockInitialValues({});
    source = FakeFleetSource(
      json: fleetSampleJson(decisions: [_fysh(), _second()]),
    );
    harness = MastermindViewHarness(
      fleet: FleetCubit(
        source: source,
        newKey: () => 'key-1',
        undoWindow: undoWindow,
        timer: inertFleetTimer,
      ),
    );
    await harness.setAccess(TestAccess.enabled);
  }

  tearDown(() => harness.dispose());

  Future<void> open(WidgetTester tester, String title) async {
    await tester.tap(find.text(title));
    await tester.pumpAndSettle();
  }

  Future<void> scrollTo(WidgetTester tester, Finder finder) =>
      tester.scrollUntilVisible(finder, 200, scrollable: fleetPageScrollable());

  testWidgets('a compact card opens the full description and options', (
    tester,
  ) async {
    await setUpHarness();
    await pumpFleetRoutes(tester, harness, now: () => fleetTestNow);
    expect(find.text('Needs you 2'), findsOneWidget);
    expect(find.text('Approve with auto-advance carousel'), findsNothing);

    await open(tester, 'Fysh revamp mockups: approve?');
    expect(find.text('1 of 2'), findsOneWidget);
    expect(find.textContaining('a fysh-branded sign-in page'), findsOneWidget);
    expect(find.textContaining('keeps the carousel still'), findsOneWidget);
    await scrollTo(tester, find.text('Approve all as recommended'));
    expect(find.text('Iris builds all four screens today.'), findsOneWidget);
    expect(find.text('Recommended'), findsOneWidget);
    expect(find.text('1 of 3'), findsOneWidget);
    for (final action in ['Reply', 'Hold', 'Snooze']) {
      expect(find.text(action), findsOneWidget);
    }
  });

  testWidgets('Send answers at once, offers Undo and moves on', (tester) async {
    await setUpHarness();
    final router = await pumpFleetRoutes(
      tester,
      harness,
      now: () => fleetTestNow,
    );
    await open(tester, 'Fysh revamp mockups: approve?');
    await scrollTo(tester, find.text('Choose this option').first);
    await tester.tap(find.text('Choose this option').first);
    await tester.pump();
    expect(source.answers, isEmpty);
    await tester.tap(find.text('Send to Iris'));
    await tester.pumpAndSettle();

    expect(source.answers.single['optionId'], 'all');
    expect(source.answers.single['key'], 'key-1');
    expect(find.text('Answered: Approve all as recommended'), findsOneWidget);
    expect(find.text('Undo'), findsOneWidget);
    // Moved straight on to the next decision.
    expect(find.text('Move the M4 lanes to the second pool?'), findsWidgets);
    expect(find.text('2 of 2'), findsNothing);
    expect(find.text('1 of 1'), findsOneWidget);

    router.pop();
    await tester.pumpAndSettle();
    expect(find.text('Needs you 1'), findsOneWidget);
    expect(find.text('Fysh revamp mockups: approve?'), findsNothing);
    await tester.tap(find.text('History'));
    await tester.pumpAndSettle();
    expect(find.text('Fysh revamp mockups: approve?'), findsOneWidget);
    expect(find.text('Approve all as recommended'), findsOneWidget);
    expect(find.text('You · Mastermind'), findsOneWidget);
    expect(find.text('Waiting for Iris'), findsOneWidget);
    expect(find.text('10:02 ICT'), findsOneWidget);
  });

  testWidgets('Undo inside the window sends nothing and restores the card', (
    tester,
  ) async {
    await setUpHarness(undoWindow: const Duration(seconds: 5));
    final router = await pumpFleetRoutes(
      tester,
      harness,
      now: () => fleetTestNow,
    );
    await open(tester, 'Move the M4 lanes to the second pool?');
    await tester.tap(find.text('Hold'));
    await tester.pumpAndSettle();
    expect(find.text('Answered: On hold'), findsOneWidget);
    expect(find.text('Needs you 1'), findsOneWidget);
    await tester.tap(find.text('Undo'));
    await tester.pump(const Duration(seconds: 6));
    expect(source.answers, isEmpty);
    expect(find.text('Needs you 2'), findsOneWidget);
    expect(router.state.matchedLocation, Routes.mastermindInbox);
  });

  testWidgets('a refused answer brings the card back with Retry', (
    tester,
  ) async {
    await setUpHarness();
    source.answerError = const ApiException(
      message: 'invalid_answer',
      statusCode: 422,
    );
    await pumpFleetRoutes(tester, harness, now: () => fleetTestNow);
    await open(tester, 'Move the M4 lanes to the second pool?');
    await tester.tap(find.text('Hold'));
    await tester.pumpAndSettle();
    expect(find.text('Needs you 2'), findsOneWidget);
    expect(find.text('Not delivered: On hold'), findsOneWidget);
    source.answerError = null;
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(source.answers.map((a) => a['key']), ['key-1', 'key-1']);
    expect(find.text('Needs you 1'), findsOneWidget);
  });

  testWidgets('Reply sends written words through the sheet', (tester) async {
    await setUpHarness();
    await pumpFleetRoutes(tester, harness, now: () => fleetTestNow);
    await open(tester, 'Move the M4 lanes to the second pool?');
    await tester.tap(find.text('Reply'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(EditableText).last, 'Do it Monday');
    await tester.pump();
    await tester.tap(find.text('Send'));
    await tester.pumpAndSettle();
    expect(source.answers.single['text'], 'Do it Monday');
    expect(source.answers.single['action'], FleetAnswerAction.reply);
    expect(source.answers.single['decisionId'], 'pool-switch');
  });

  testWidgets('a decision from History opens read-only with its answer', (
    tester,
  ) async {
    await setUpHarness();
    source.json = fleetSampleJson(
      decisions: [_fysh()],
      answers: {
        'fysh-revamp': {
          'action': 'approve',
          'optionId': 'auto',
          'revision': 1,
          'answeredAt': '2026-11-20T02:53:09.000Z',
          'pickedUp': true,
        },
      },
    );
    await pumpFleetRoutes(tester, harness, now: () => fleetTestNow);
    expect(find.text('Needs you'), findsOneWidget);
    await tester.tap(find.text('History'));
    await tester.pumpAndSettle();
    expect(find.text('Received by Iris'), findsOneWidget);
    await open(tester, 'Fysh revamp mockups: approve?');
    expect(find.text('YOUR ANSWER'), findsOneWidget);
    expect(find.text('Approve with auto-advance carousel'), findsWidgets);
    expect(find.text('Nov 20 09:53 ICT'), findsOneWidget);
    expect(find.text('Choose this option'), findsNothing);
    expect(find.text('Hold'), findsNothing);
  });

  testWidgets('a decision closed before this session shows its record', (
    tester,
  ) async {
    await setUpHarness();
    source.json = fleetSampleJson(
      decisions: const [],
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
    await pumpFleetRoutes(tester, harness, now: () => fleetTestNow);
    await tester.tap(find.text('History'));
    await tester.pumpAndSettle();
    await open(tester, 'Retire the Vercel cron?');
    expect(find.text('YOUR ANSWER'), findsOneWidget);
    expect(find.text('Retire it'), findsOneWidget);
    expect(find.text('You · WhatsApp'), findsOneWidget);
    expect(find.text('Delivered to Iris'), findsOneWidget);
    expect(find.text('This decision is closed'), findsNothing);
  });

  testWidgets('a withdrawn sign-in from History shows no code or action', (
    tester,
  ) async {
    await setUpHarness();
    source.json = fleetSampleJson(decisions: [fleetLoginJson()]);
    await pumpFleetRoutes(tester, harness, now: () => fleetTestNow);
    expect(find.text('8F3K-Q2MX'), findsOneWidget);
    source.json = fleetSampleJson(
      decisions: const [],
      resolved: [
        {
          'id': 'login-gh',
          'kind': 'login',
          'title': 'Sign in to GitHub for the release bot',
          'outcome': 'Withdrawn',
          'resolvedAt': '2026-11-20T03:01:00.000Z',
        },
      ],
    );
    await harness.runtime.fleet.refresh();
    await tester.pump();
    await tester.tap(find.text('History'));
    await tester.pumpAndSettle();
    await open(tester, 'Sign in to GitHub for the release bot');
    expect(find.text('YOUR ANSWER'), findsOneWidget);
    expect(find.text('8F3K-Q2MX'), findsNothing);
    expect(find.text('I signed in'), findsNothing);
    expect(find.text('Closed, no answer needed'), findsOneWidget);
  });

  testWidgets('an ask that vanished without history reads only', (
    tester,
  ) async {
    await setUpHarness();
    final router = await pumpFleetRoutes(
      tester,
      harness,
      now: () => fleetTestNow,
    );
    source.json = fleetSampleJson(decisions: [_second()]);
    await harness.runtime.fleet.refresh();
    unawaited(router.push(Routes.mastermindFleetDecisionPath('fysh-revamp')));
    await tester.pumpAndSettle();
    expect(find.text('Fysh revamp mockups: approve?'), findsOneWidget);
    expect(find.text('This decision is closed'), findsOneWidget);
    expect(find.text('Choose this option'), findsNothing);
    expect(find.text('Hold'), findsNothing);
    expect(find.text('Reply'), findsNothing);
  });

  testWidgets('a reply written while another device answered is not sent', (
    tester,
  ) async {
    await setUpHarness();
    await pumpFleetRoutes(tester, harness, now: () => fleetTestNow);
    await open(tester, 'Move the M4 lanes to the second pool?');
    await tester.tap(find.text('Reply'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(EditableText).last, 'Do it Monday');
    await tester.pump();
    source.json = fleetSampleJson(
      decisions: [_fysh(), _second()],
      answers: {
        'pool-switch': {
          'action': 'hold',
          'revision': 1,
          'answeredAt': '2026-11-20T03:01:00.000Z',
          'pickedUp': true,
        },
      },
    );
    await harness.runtime.fleet.refresh();
    await tester.tap(find.text('Send'));
    await tester.pumpAndSettle();
    expect(source.answers, isEmpty);
    expect(
      find.text('Not sent: this was answered while you wrote'),
      findsOneWidget,
    );
    // Iris takes only the first answer, so a second is never offered: the
    // words are kept for the clipboard instead.
    expect(find.text('Send anyway'), findsNothing);
    final copied = <String>[];
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      SystemChannels.platform,
      (call) async {
        if (call.method == 'Clipboard.setData') {
          copied.add((call.arguments as Map)['text'] as String);
        }
        return null;
      },
    );
    addTearDown(
      () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        null,
      ),
    );
    await tester.tap(find.text('Copy text'));
    await tester.pumpAndSettle();
    expect(copied, ['Do it Monday']);
    expect(source.answers, isEmpty);
  });

  testWidgets('a closed decision the app never saw explains itself', (
    tester,
  ) async {
    await setUpHarness();
    await pumpFleetRoutes(
      tester,
      harness,
      now: () => fleetTestNow,
      initial: Routes.mastermindFleetDecisionPath('missing'),
    );
    expect(find.text('This decision is closed'), findsOneWidget);
    expect(find.text('Back to Inbox'), findsOneWidget);
  });

  testWidgets('Inbox and detail fit 320 px at 2x text in Vietnamese', (
    tester,
  ) async {
    await setUpHarness();
    await pumpFleetRoutes(
      tester,
      harness,
      now: () => fleetTestNow,
      size: const Size(320, 720),
      textScale: 2,
      locale: const Locale('vi'),
    );
    expect(tester.takeException(), isNull);
    expect(find.text('Cần bạn 2'), findsOneWidget);
    await open(tester, 'Fysh revamp mockups: approve?');
    expect(tester.takeException(), isNull);
    await scrollTo(tester, find.text('Chọn phương án này').first);
    expect(tester.takeException(), isNull);
  });
}
