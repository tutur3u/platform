import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_item_page.dart';
import 'package:mobile/features/mastermind/view/inbox/use_recommendations_sheet.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';
import '../../../helpers/mastermind_replies_fixture.dart';
import '../../../helpers/mastermind_view_harness.dart';

class _MockAuthCubit extends MockCubit<AuthState> implements AuthCubit {}

Map<String, dynamic> _normal(int n) => inboxItem(n, title: 'Ask $n');
Map<String, dynamic> _risky(int n) => {
  ...inboxItem(n, title: 'Ask $n'),
  'risk_class': 'deploy',
};
Map<String, dynamic> _incomplete(int n) => {
  ...inboxItem(n, title: 'Ask $n'),
  'text_complete': false,
  'risk_class': 'normal',
};

/// p2 fields, but no `risk_class` at all.
Map<String, dynamic> _nullRisk(int n) => {
  ...inboxItem(n, title: 'Ask $n'),
  'inbox_class': 'decision',
};

Future<MastermindRepliesCubit> _loaded(FakeReplyTransport transport) async {
  final replies = repliesCubit(transport: transport);
  addTearDown(replies.close);
  await replies.loadCapabilities();
  await replies.ensureLoaded();
  return replies;
}

void main() {
  test('risky and incomplete asks are excluded from the batch', () async {
    final replies = await _loaded(FakeReplyTransport());
    final items = [
      parsedItem(_normal(1)),
      parsedItem(_risky(2)),
      parsedItem(_incomplete(3)),
      parsedItem({..._normal(4), 'risk_class': 'normal'}),
      parsedItem(inboxItem(5, recommended: null)),
    ];
    final plan = batchPlan(items, replies.state);
    expect(plan.included.map((i) => i.id), [inboxItemId(1), inboxItemId(4)]);
    expect(plan.excluded.map((e) => (e.$1.id, e.$2)), [
      (inboxItemId(2), BatchExclusion.risky),
      (inboxItemId(3), BatchExclusion.incomplete),
    ]);
    expect(recommendableAsks(items, replies.state), hasLength(2));
  });

  test('a null risk_class beside p2 fields is risky', () async {
    final replies = await _loaded(FakeReplyTransport());
    final plan = batchPlan([
      parsedItem(_nullRisk(1)),
      parsedItem(_normal(2)),
    ], replies.state);
    expect(plan.included.map((i) => i.id), [inboxItemId(2)]);
    expect(plan.excluded.single.$2, BatchExclusion.risky);
  });

  test('a risky ask is never answered through the reply outbox', () async {
    final transport = FakeReplyTransport();
    final replies = await _loaded(transport);
    for (final json in [_risky(1), _nullRisk(2)]) {
      final item = parsedItem(json);
      expect(replies.queueOption(item: item, optionIndex: 0), isFalse);
      expect(await replies.submit(item: item, optionIndex: 0), isFalse);
      expect(await replies.submit(item: item, text: 'yes'), isFalse);
    }
    expect(replies.state.outbox, isEmpty);
    expect(replies.state.pendingOptions, isEmpty);
    expect(transport.sent, isEmpty);
  });

  testWidgets('the sheet lists Not included, and sends only checked asks', (
    tester,
  ) async {
    final transport = FakeReplyTransport();
    final replies = await _loaded(transport);
    final plan = batchPlan([
      parsedItem(_normal(1)),
      parsedItem(_risky(2)),
      parsedItem(_incomplete(3)),
      parsedItem(_normal(4)),
    ], replies.state);
    await tester.pumpApp(
      UseRecommendationsSheet(
        items: plan.included,
        excluded: plan.excluded,
        replies: replies,
      ),
    );
    expect(find.text('Send 2 answers'), findsOneWidget);
    expect(find.text('Approve · Recommended'), findsNWidgets(2));
    expect(find.text('+1 other option'), findsNWidgets(2));
    expect(find.text('Not included: answer these one by one'), findsOneWidget);
    expect(find.text('Needs approval on a trusted device'), findsOneWidget);
    expect(
      find.text('Incomplete: open it to read the full ask'),
      findsOneWidget,
    );
    expect(
      find.byKey(ValueKey('use-recommendations-check-${inboxItemId(2)}')),
      findsNothing,
    );

    await tester.tap(
      find.byKey(ValueKey('use-recommendations-check-${inboxItemId(4)}')),
    );
    await tester.pump();
    expect(find.text('Send 1 answer'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('use-recommendations-confirm')));
    await tester.pump();
    expect(find.text('1 of 1 sent'), findsOneWidget);
    expect(replies.state.pendingOptions.keys, {inboxItemId(1)});
    final entry = replies.state.outbox.single;
    expect(entry.optionIndex, 0);
    expect(entry.itemId, inboxItemId(1));
    expect(transport.sent, isEmpty);
    replies.undoOption(inboxItemId(1));
  });

  testWidgets('unchecking every ask disables the send button', (tester) async {
    final replies = await _loaded(FakeReplyTransport());
    final items = [parsedItem(_normal(1))];
    await tester.pumpApp(
      UseRecommendationsSheet(items: items, replies: replies),
    );
    await tester.tap(
      find.byKey(ValueKey('use-recommendations-check-${inboxItemId(1)}')),
    );
    await tester.pump();
    final button = tester.widget<AppButton>(
      find.byKey(const ValueKey('use-recommendations-confirm')),
    );
    expect(button.onPressed, isNull);
  });

  testWidgets('a risky ask detail shows "coming soon" and sends nothing', (
    tester,
  ) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(430, 3000);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final transport = FakeReplyTransport();
    final replies = repliesCubit(transport: transport);
    final harness = MastermindViewHarness(
      source: FakeHubSource(bytes: snapshotBytes(inboxJson([_risky(1)]))),
      replies: replies,
    );
    addTearDown(harness.dispose);
    final auth = _MockAuthCubit();
    when(auth.signOut).thenAnswer((_) async {});
    await harness.setAccess(TestAccess.enabled);
    await tester.pumpApp(
      BlocProvider<AuthCubit>.value(
        value: auth,
        child: harness.wrap(MastermindItemPage(itemId: inboxItemId(1))),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('risky-ask-coming-soon')), findsOneWidget);
    expect(
      find.text('Approve on a trusted device: coming soon'),
      findsOneWidget,
    );
    expect(find.widgetWithText(AppButton, 'Send reply'), findsNothing);
    expect(find.byKey(const ValueKey('mastermind-option-0')), findsNothing);
    expect(replies.state.outbox, isEmpty);
    expect(transport.sent, isEmpty);
  });
}
