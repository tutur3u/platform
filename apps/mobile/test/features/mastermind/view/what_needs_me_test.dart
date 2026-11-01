import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/presentation/what_needs_me.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_inbox_page.dart';
import 'package:mobile/features/mastermind/view/inbox/use_recommendations_sheet.dart';
import 'package:mobile/features/mastermind/view/inbox/what_needs_me_header.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';

import '../../../helpers/mastermind_iris_fixture.dart';
import '../../../helpers/mastermind_replies_fixture.dart';
import '../../../helpers/mastermind_view_harness.dart';
import '../../../helpers/pump_app.dart';

Future<MastermindViewHarness> _pumpInbox(
  WidgetTester tester,
  Map<String, dynamic> json, {
  MastermindRepliesCubit? replies,
}) async {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = const Size(430, 1600);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetPhysicalSize);
  final harness = MastermindViewHarness(
    source: FakeHubSource(bytes: snapshotBytes(json)),
    replies: replies,
  );
  addTearDown(harness.dispose);
  await harness.setAccess(TestAccess.enabled);
  await tester.pumpApp(
    harness.wrap(
      BlocProvider(
        create: (_) => ShellChromeActionsCubit(),
        child: const MastermindInboxPage(),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return harness;
}

Map<String, dynamic> _timed(
  int n, {
  String? urgency,
  String? deadline,
  String? recommended = 'Approve',
}) => {
  ...inboxItem(n, title: 'Ask $n', recommended: recommended),
  'urgency': ?urgency,
  'deadline': ?deadline,
};

void main() {
  test('counts each fixture ask once, in its most pressing bucket', () {
    final counts = WhatNeedsMeCounts.from(irisFixtureAsks());
    expect(counts.urgent, 4);
    expect(counts.soon, 4);
    expect(counts.fyi, 3);
    expect(counts.other, 1);
    expect(counts.total, 12);
  });

  test('the recommended choice is a selectable option, or none', () {
    final asks = irisFixtureAsks();
    expect(recommendedChoice(asks.first), (0, 'Roll back'));
    // Recommendation-free and option-free asks have nothing to send.
    expect(recommendedChoice(asks[3]), isNull);
    expect(recommendedChoice(asks[6]), isNull);
  });

  testWidgets('the header shows counts and hides an action it cannot take', (
    tester,
  ) async {
    await tester.pumpApp(
      WhatNeedsMeHeader(counts: WhatNeedsMeCounts.from(irisFixtureAsks())),
    );
    expect(find.text('What needs me'), findsOneWidget);
    expect(find.text('4 urgent'), findsOneWidget);
    expect(find.text('4 soon'), findsOneWidget);
    expect(find.text('3 FYI'), findsOneWidget);
    expect(find.text('1 other'), findsOneWidget);
    expect(find.byKey(const ValueKey('use-recommendations')), findsNothing);
  });

  testWidgets('Inbox rows carry urgency badges and deadline labels', (
    tester,
  ) async {
    await _pumpInbox(
      tester,
      inboxJson([
        _timed(1, urgency: 'urgent', deadline: 'within_hours'),
        _timed(2, urgency: 'high', deadline: 'this_week'),
        _timed(3),
      ], security: false),
    );
    expect(find.text('Urgent'), findsOneWidget);
    expect(find.text('High priority'), findsOneWidget);
    expect(find.text('Answer within hours'), findsOneWidget);
    expect(find.text('Answer this week'), findsOneWidget);
    expect(find.text('1 urgent'), findsOneWidget);
    expect(find.text('1 soon'), findsOneWidget);
    expect(find.text('1 other'), findsOneWidget);
  });

  testWidgets('Use recommendations confirms, then queues one undoable reply '
      'per ask', (tester) async {
    final transport = FakeReplyTransport();
    final replies = repliesCubit(transport: transport);
    await _pumpInbox(
      tester,
      inboxJson([
        _timed(1, urgency: 'urgent'),
        _timed(2),
        _timed(3, recommended: null),
      ], security: false),
      replies: replies,
    );
    await tester.tap(find.byKey(const ValueKey('use-recommendations')));
    await tester.pumpAndSettle();
    // Only the two asks with a recommendation are listed; nothing sent yet.
    expect(find.text('Send 2 answers'), findsOneWidget);
    expect(find.text('Approve · Recommended'), findsNWidgets(2));
    expect(replies.state.pendingOptions, isEmpty);

    await tester.tap(find.byKey(const ValueKey('use-recommendations-confirm')));
    await tester.pump();
    expect(find.text('Sending. Undo on its card.'), findsNWidgets(2));
    expect(find.text('2 of 2 sent'), findsOneWidget);
    expect(replies.state.pendingOptions.keys, {inboxItemId(1), inboxItemId(2)});
    // Held for the undo window: nothing has gone out yet.
    expect(transport.sent, isEmpty);
    final keys = replies.state.outbox.map((e) => e.idempotencyKey).toSet();
    expect(keys, hasLength(2));

    await tester.tap(find.byKey(const ValueKey('use-recommendations-done')));
    await tester.pumpAndSettle();
    expect(find.text('Undo'), findsNWidgets(2));
    replies.undoOption(inboxItemId(1));
    await tester.pump();
    expect(replies.state.pendingOptions.keys, {inboxItemId(2)});
    await tester.pump(const Duration(seconds: 31));
  });

  testWidgets('an ask answered meanwhile is reported as skipped', (
    tester,
  ) async {
    final replies = repliesCubit();
    addTearDown(replies.close);
    await replies.loadCapabilities();
    await replies.ensureLoaded();
    final items = [parsedItem(_timed(1)), parsedItem(_timed(2))];
    // Already answered on this device before the sheet confirms.
    expect(replies.queueOption(item: items.first, optionIndex: 0), isTrue);
    await tester.pumpApp(
      UseRecommendationsSheet(items: items, replies: replies),
    );
    await tester.tap(find.byKey(const ValueKey('use-recommendations-confirm')));
    await tester.pump();
    expect(
      find.text('Skipped: already answered, or replies are off'),
      findsOneWidget,
    );
    expect(find.text('Sending. Undo on its card.'), findsOneWidget);
    expect(find.text('1 of 2 sent'), findsOneWidget);
    replies
      ..undoOption(items.first.id)
      ..undoOption(items.last.id);
  });
}
