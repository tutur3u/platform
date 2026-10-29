import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/features/mastermind/presentation/inbox_segment.dart';
import 'package:mobile/features/mastermind/replies/answered_elsewhere_cubit.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/replies/reply_outcome.dart';
import 'package:mobile/features/mastermind/view/inbox/decision_card_actions.dart';
import 'package:mobile/features/mastermind/view/inbox/inbox_item_tile.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_inbox_page.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_segmented_control.dart';

import '../../../helpers/helpers.dart';
import '../../../helpers/mastermind_replies_fixture.dart';
import '../../../helpers/mastermind_view_harness.dart';

const _staleCopy =
    'This question changed or was already answered. Review it again.';

Map<String, dynamic> _open() => inboxJson([inboxItem(1)], security: false);

/// GMT+7 06:21 on Jan 31 is 23:21 UTC on Jan 30.
Map<String, dynamic> _history(List<Map<String, dynamic>> rows) =>
    inboxJson([], security: false)..['decisions_resolved'] = rows;

Map<String, dynamic> _row(
  int n, {
  String? via,
  String resolution = 'Approve',
  String at = '2026-01-30T23:21:00+00:00',
  String status = 'resolved',
}) => {
  ...inboxItem(n),
  'status': status,
  'resolution': resolution,
  'resolved_at': at,
  'answered_via': ?via,
};

Map<String, dynamic> _answeredOnMac() => _history([_row(1, via: 'mac')]);

Future<MastermindViewHarness> _pump(
  WidgetTester tester,
  Map<String, dynamic> json, {
  MastermindRepliesCubit? replies,
  MastermindAnsweredElsewhereCubit? answered,
  Size size = const Size(430, 4000),
  double textScale = 1,
  Locale? locale,
}) async {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = size;
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetPhysicalSize);
  if (locale != null) {
    tester.platformDispatcher.localesTestValue = [locale];
    addTearDown(tester.platformDispatcher.clearLocalesTestValue);
  }
  final harness = MastermindViewHarness(
    source: FakeHubSource(bytes: snapshotBytes(json)),
    replies: replies,
    answered: answered,
  );
  addTearDown(harness.dispose);
  await harness.setAccess(TestAccess.enabled);
  await tester.pumpApp(
    harness.wrap(
      Builder(
        builder: (context) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: TextScaler.linear(textScale)),
          child: const MastermindInboxPage(),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  expect(tester.takeException(), isNull);
  return harness;
}

/// The hub publishes [json]; the open card reacts before its linger ends.
Future<void> _publish(
  WidgetTester tester,
  MastermindViewHarness harness,
  Map<String, dynamic> json,
) async {
  harness.source.bytes = snapshotBytes(json);
  await harness.snapshot.refresh();
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
}

Future<void> _segment(WidgetTester tester, String label) async {
  await tester.tap(
    find.descendant(
      of: find.byType(MastermindSegmentedControl<InboxSegment>),
      matching: find.text(label),
    ),
  );
  await tester.pumpAndSettle();
}

Finder _option(String label) =>
    find.descendant(of: find.byType(AppButton), matching: find.text(label));

void main() {
  setUpAll(initializeDateFormatting);

  group('answered elsewhere', () {
    testWidgets('the open card folds its choices, lingers, then moves on', (
      tester,
    ) async {
      final harness = await _pump(tester, _open());
      expect(_option('Approve'), findsOneWidget);

      await _publish(tester, harness, _answeredOnMac());
      expect(find.text('Answered on Mac · Approve'), findsOneWidget);
      expect(find.byType(DecisionCardActions), findsNothing);
      expect(find.byType(InboxItemTile), findsOneWidget);
      expect(tester.takeAnnouncements(), isEmpty);

      await tester.pump(MastermindAnsweredElsewhereCubit.defaultLinger);
      await tester.pumpAndSettle();
      expect(find.text('Answered on Mac · Approve'), findsNothing);
      expect(find.byType(InboxItemTile), findsNothing);

      await _segment(tester, 'Resolved');
      expect(find.text('Jan 31, 2026'), findsOneWidget);
      expect(find.text('Approve · you · on Mac · 06:21'), findsOneWidget);
    });

    testWidgets('an undoable reply is cancelled, deleted and announced', (
      tester,
    ) async {
      final store = SpyOutboxStore();
      final transport = FakeReplyTransport();
      final replies = repliesCubit(store: store, transport: transport);
      final harness = await _pump(tester, _open(), replies: replies);

      await tester.tap(_option('Approve'));
      await tester.pump();
      expect(replies.state.pendingOptions, hasLength(1));
      expect((await store.inner.read()).single.holdUntil, isNotNull);

      await _publish(tester, harness, _answeredOnMac());
      expect(
        tester.takeAnnouncements(),
        contains(isAccessibilityAnnouncement('Already answered on Mac')),
      );
      expect(find.text('Answered on Mac · Approve'), findsOneWidget);
      expect(replies.state.pendingOptions, isEmpty);
      expect(replies.state.outbox, isEmpty);
      expect(await store.inner.read(), isEmpty);

      // Past the undo window: nothing was ever sent.
      await tester.pump(const Duration(seconds: 6));
      await tester.pumpAndSettle();
      expect(transport.sent, isEmpty);
    });

    testWidgets('a 409 after sending reads as answered, never an error', (
      tester,
    ) async {
      late MastermindViewHarness harness;
      final answered = MastermindAnsweredElsewhereCubit();
      final transport = FakeReplyTransport(const [ReplyStale()]);
      final replies = repliesCubit(
        transport: transport,
        isAnsweredElsewhere: answered.isAnswered,
        refreshSnapshot: () => harness.snapshot.refresh(),
        optionUndoWindow: const Duration(milliseconds: 100),
      );
      harness = await _pump(
        tester,
        _open(),
        replies: replies,
        answered: answered,
      );

      await tester.tap(_option('Approve'));
      await tester.pump();
      // The Mac answers while this reply is on its way.
      harness.source.bytes = snapshotBytes(_answeredOnMac());
      await tester.pump(const Duration(milliseconds: 150));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      expect(transport.sent, hasLength(1));
      expect(find.text('Answered on Mac · Approve'), findsOneWidget);
      expect(find.text(_staleCopy), findsNothing);
      expect(replies.state.statusFor(inboxItemId(1)).issue, isNull);
      expect(tester.takeAnnouncements(), isEmpty);
      await tester.pump(MastermindAnsweredElsewhereCubit.defaultLinger);
      await tester.pumpAndSettle();
    });
  });

  group('resolved rows', () {
    testWidgets('a withdrawn ask is only listed as resolved', (tester) async {
      await _pump(tester, _history([_row(1, status: 'withdrawn', via: 'mac')]));
      expect(find.byType(InboxItemTile), findsNothing);

      await _segment(tester, 'Resolved');
      expect(find.text('Withdrawn · no longer needed · 06:21'), findsOneWidget);
      expect(find.byType(DecisionCardActions), findsNothing);
    });

    testWidgets('rows group by GMT+7 day, newest first', (tester) async {
      await _pump(
        tester,
        _history([
          _row(2, via: 'mac', resolution: 'Defer', at: '2026-01-30T16:50:00Z'),
          _row(1, via: 'phone'),
          _row(3, via: 'auto', at: '2026-01-30T23:40:00Z'),
          _row(4, via: 'chat', at: '2026-01-30T23:30:00Z'),
        ]),
      );
      await _segment(tester, 'Resolved');
      final today = find.text('Jan 31, 2026');
      final yesterday = find.text('Jan 30, 2026');
      expect(today, findsOneWidget);
      expect(yesterday, findsOneWidget);
      expect(
        tester.getTopLeft(today).dy,
        lessThan(tester.getTopLeft(yesterday).dy),
      );
      final rows = [
        'Approve · automatically · 06:40',
        'Approve · you · in chat · 06:30',
        'Approve · you · on phone · 06:21',
        'Defer · you · on Mac · 23:50',
      ];
      for (final row in rows) {
        expect(find.text(row), findsOneWidget);
      }
      final tops = [for (final row in rows) tester.getTopLeft(find.text(row))];
      for (var i = 1; i < tops.length; i++) {
        expect(tops[i].dy, greaterThan(tops[i - 1].dy));
      }
      expect(tester.getTopLeft(yesterday).dy, lessThan(tops.last.dy));
    });
  });

  testWidgets('Vietnamese copy for every new state', (tester) async {
    final harness = await _pump(tester, _open(), locale: const Locale('vi'));
    await _publish(tester, harness, _answeredOnMac());
    expect(find.text('Đã trả lời trên Mac · Approve'), findsOneWidget);
    await tester.pump(MastermindAnsweredElsewhereCubit.defaultLinger);
    await tester.pumpAndSettle();

    harness.source.bytes = snapshotBytes(
      _history([
        _row(1, via: 'phone'),
        _row(2, status: 'withdrawn', at: '2026-01-30T23:00:00Z'),
      ]),
    );
    await harness.snapshot.refresh();
    await tester.pumpAndSettle();
    await _segment(tester, 'Đã xử lý');
    expect(
      find.text('Approve · bạn · trên điện thoại · 06:21'),
      findsOneWidget,
    );
    expect(find.text('Đã rút lại · không còn cần nữa · 06:00'), findsOneWidget);
  });

  for (final locale in const [Locale('en'), Locale('vi')]) {
    testWidgets('2.0x text at 320 px fits in ${locale.languageCode}', (
      tester,
    ) async {
      final store = SpyOutboxStore();
      final replies = repliesCubit(store: store);
      final harness = await _pump(
        tester,
        inboxJson([inboxItem(1), inboxItem(2)], security: false)
          ..['decisions_resolved'] = [
            _row(3, via: 'phone'),
            _row(4, status: 'withdrawn'),
          ],
        replies: replies,
        size: const Size(320, 6000),
        textScale: 2,
        locale: locale,
      );
      await tester.tap(_option('Approve').first);
      await tester.pump();
      expect(tester.takeException(), isNull, reason: 'undo bar');
      await _publish(
        tester,
        harness,
        inboxJson([inboxItem(2)], security: false)
          ..['decisions_resolved'] = [
            _row(1, via: 'mac'),
            _row(3, via: 'phone'),
            _row(4, status: 'withdrawn'),
          ],
      );
      expect(tester.takeException(), isNull);
      expect(find.byType(InboxItemTile), findsNWidgets(2));
      tester.takeAnnouncements();
      await tester.pump(MastermindAnsweredElsewhereCubit.defaultLinger);
      await tester.pumpAndSettle();
      await _segment(
        tester,
        locale.languageCode == 'vi' ? 'Đã xử lý' : 'Resolved',
      );
      expect(tester.takeException(), isNull);
      expect(find.byType(InboxItemTile), findsNWidgets(3));
    });
  }
}
