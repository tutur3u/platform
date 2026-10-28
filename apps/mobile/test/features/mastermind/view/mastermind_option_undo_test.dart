import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_item_page.dart';

import '../../../helpers/helpers.dart';
import '../../../helpers/mastermind_replies_fixture.dart';
import '../../../helpers/mastermind_view_harness.dart';

Future<FakeReplyTransport> _pump(WidgetTester tester) async {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = const Size(390, 2400);
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final transport = FakeReplyTransport();
  final harness = MastermindViewHarness(
    source: FakeHubSource(bytes: snapshotBytes(inboxJson([inboxItem(1)]))),
    replies: repliesCubit(transport: transport),
  );
  addTearDown(harness.dispose);
  await harness.setAccess(TestAccess.enabled);
  await tester.pumpApp(
    harness.wrap(MastermindItemPage(itemId: inboxItemId(1))),
  );
  await tester.pumpAndSettle();
  return transport;
}

Finder get _undo => find.widgetWithText(TextButton, 'Undo');
Finder get _sending => find.text('Sending “Approve”');

void main() {
  const window = MastermindRepliesCubit.defaultOptionUndoWindow;

  testWidgets('one tap shows Sending · Undo and sends after five seconds', (
    tester,
  ) async {
    final transport = await _pump(tester);
    await tester.tap(find.text('Approve'));
    await tester.pump();
    expect(_sending, findsOneWidget);
    expect(_undo, findsOneWidget);
    expect(tester.getSize(_undo).height, greaterThanOrEqualTo(44));
    expect(transport.sent, isEmpty);

    await tester.pump(window - const Duration(seconds: 1));
    expect(transport.sent, isEmpty);
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    expect(transport.sent.single.optionIndex, 0);
    expect(_undo, findsNothing);
    expect(find.text('Sent · waiting for Mastermind'), findsOneWidget);
  });

  testWidgets('Undo inside the window sends nothing and restores the '
      'options', (tester) async {
    final transport = await _pump(tester);
    await tester.tap(find.text('Defer'));
    await tester.pump();
    await tester.tap(_undo);
    await tester.pump();
    expect(_undo, findsNothing);
    await tester.pump(window * 2);
    await tester.pumpAndSettle();
    expect(transport.sent, isEmpty);
    expect(
      tester
          .widget<AppButton>(find.widgetWithText(AppButton, 'Approve'))
          .onPressed,
      isNotNull,
    );
    // The reply can still be sent afterwards, once.
    await tester.tap(find.text('Approve'));
    await tester.pump(window);
    await tester.pumpAndSettle();
    expect(transport.sent.single.optionIndex, 0);
  });

  testWidgets('other options are locked in the window, so one reply goes '
      'out', (tester) async {
    final transport = await _pump(tester);
    await tester.tap(find.text('Approve'));
    await tester.pump();
    expect(
      tester
          .widget<AppButton>(find.widgetWithText(AppButton, 'Defer'))
          .onPressed,
      isNull,
    );
    await tester.tap(find.text('Defer'), warnIfMissed: false);
    await tester.pump(window);
    await tester.pumpAndSettle();
    expect(transport.sent, hasLength(1));
    expect(transport.sent.single.optionIndex, 0);
  });

  testWidgets('leaving the screen inside the window still sends', (
    tester,
  ) async {
    final transport = await _pump(tester);
    await tester.tap(find.text('Approve'));
    await tester.pump();
    await tester.pumpWidget(const SizedBox());
    expect(transport.sent, isEmpty);
    await tester.pump(window);
    await tester.pump();
    expect(transport.sent.single.optionIndex, 0);
  });
}
