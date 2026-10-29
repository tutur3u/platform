import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_state.dart';
import 'package:mobile/features/mastermind/replies/reply_models.dart';
import 'package:mobile/features/mastermind/view/inbox/reply_status_panel.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_clock.dart';

import '../../../helpers/helpers.dart';
import '../../../helpers/mastermind_replies_fixture.dart';

Future<void> _pump(WidgetTester tester, {required double scale}) async {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = const Size(320, 2000);
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final replies = repliesCubit();
  addTearDown(replies.close);
  await tester.pumpApp(
    MastermindClockScope(
      // Five minutes after the reply was queued.
      now: () => DateTime.utc(2026, 1, 31, 17, 37),
      child: Builder(
        builder: (outer) => Localizations.override(
          context: outer,
          locale: const Locale('vi'),
          child: Builder(
            builder: (context) => MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: TextScaler.linear(scale)),
              child: Align(
                alignment: Alignment.topLeft,
                child: SingleChildScrollView(
                  child: ReplyEntryPanel(
                    entry: OutboxEntry(
                      idempotencyKey: 'k',
                      itemId: inboxItemId(1),
                      versionHash: inboxHash('a'),
                      createdAt: DateTime.utc(2026, 1, 31, 17, 32),
                      optionIndex: 0,
                      optionLabel: 'Phê duyệt cửa sổ phát hành tối nay',
                    ),
                    status: ReplyItemStatus.idle,
                    replies: replies,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}

void main() {
  testWidgets('the queued time sits under the reply at 2.0x on 320 in vi', (
    tester,
  ) async {
    await _pump(tester, scale: 2);
    expect(tester.takeException(), isNull);
    final reply = find.textContaining('Phê duyệt cửa sổ');
    final queued = findTimeLabel('Đã xếp hàng 5 phút');
    expect(reply, findsOneWidget);
    expect(queued, findsOneWidget);
    expect(
      tester.getTopLeft(queued).dy,
      greaterThanOrEqualTo(tester.getBottomLeft(reply).dy),
    );
  });

  testWidgets(
    'at normal size the queued time stays trailing without overflow',
    (tester) async {
      await _pump(tester, scale: 1);
      expect(tester.takeException(), isNull);
      final reply = find.textContaining('Phê duyệt cửa sổ');
      final queued = findTimeLabel('Đã xếp hàng 5 phút');
      expect(queued, findsOneWidget);
      expect(
        tester.getTopLeft(queued).dx,
        greaterThan(tester.getTopRight(reply).dx - 1),
      );
    },
  );
}
