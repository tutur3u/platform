import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/replies/reply_models.dart';
import 'package:mobile/features/mastermind/view/inbox/inbox_item_tile.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_replies_watcher.dart';

import '../../../helpers/helpers.dart';
import '../../../helpers/mastermind_home_fixture.dart';
import '../../../helpers/mastermind_replies_fixture.dart';
import '../../../helpers/mastermind_view_harness.dart';

Map<String, dynamic> _ask({bool short = true}) => {
  ...inboxItem(1, title: 'Canonical title', body: 'Canonical question'),
  'by': 'Orchestrator',
  'created_at': '2026-01-31T17:00:00+00:00',
  if (short) ...{
    'hub_title': 'Ship tonight?',
    'hub_text': 'Choose the release window.',
    'hub_options': ['Ship', 'Later'],
    'hub_recommended': 'Ship',
  },
};

NeedsYou _item(Map<String, dynamic> row) => parsedSnapshot(
  inboxJson([row], security: false),
).now.needsYou.whereType<NeedsYou>().single;

Future<MastermindViewHarness> _pump(
  WidgetTester tester, {
  required NeedsYou item,
  String locale = 'en',
  FakeReplyTransport? transport,
  bool supported = true,
}) async {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = const Size(320, 3000);
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final replies = repliesCubit(
    transport: transport,
    fetchCapabilities: capabilities(replies: supported),
  );
  await replies.loadCapabilities();
  final harness = MastermindViewHarness(replies: replies);
  addTearDown(harness.dispose);
  await tester.pumpApp(
    harness.wrap(
      Builder(
        builder: (outer) => Localizations.override(
          context: outer,
          locale: Locale(locale),
          child: Builder(
            builder: (context) => MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: const TextScaler.linear(2)),
              child: MastermindRepliesWatcher(
                child: SingleChildScrollView(
                  child: InboxItemTile(item: item, now: testNow),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return harness;
}

void main() {
  for (final locale in ['en', 'vi']) {
    testWidgets('A2 card, recommendation and chips at 320px 2x in $locale', (
      tester,
    ) async {
      await _pump(tester, item: _item(_ask()), locale: locale);
      expect(find.text('Ship tonight?'), findsOneWidget);
      expect(find.text('Choose the release window.'), findsOneWidget);
      expect(find.text('Ship'), findsOneWidget);
      expect(find.text('Later'), findsOneWidget);
      expect(find.text('Canonical title'), findsNothing);
      expect(find.text('Tuturuuu'), findsOneWidget);
      expect(find.textContaining('Orchestrator'), findsOneWidget);
      expect(findTimeLabel(locale == 'en' ? '32m' : '32 phút'), findsOneWidget);
      expect(
        find.text(locale == 'en' ? 'Recommended' : 'Đề xuất'),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('canonical fallback without A2 fields in $locale', (
      tester,
    ) async {
      await _pump(tester, item: _item(_ask(short: false)), locale: locale);
      expect(find.text('Canonical title'), findsOneWidget);
      expect(find.text('Canonical question'), findsOneWidget);
      expect(find.text('Approve'), findsOneWidget);
      expect(find.text('Defer'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('one tap, undo, then five-second window and one canonical send', (
    tester,
  ) async {
    final transport = FakeReplyTransport();
    final harness = await _pump(
      tester,
      item: _item(_ask()),
      transport: transport,
    );
    await tester.tap(find.text('Later'));
    await tester.pump();
    expect(find.text('Undo'), findsOneWidget);
    expect(transport.sent, isEmpty);
    await tester.tap(find.text('Undo'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 6));
    expect(transport.sent, isEmpty);
    expect(find.text('Later'), findsOneWidget);

    await tester.tap(find.text('Later'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 4));
    expect(transport.sent, isEmpty);
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    expect(transport.sent, hasLength(1));
    expect(transport.sent.single.optionIndex, 1);
    expect(transport.sent.single.optionLabel, 'Later');
    expect(
      harness.runtime.replies.state.outbox.single.status,
      OutboxStatus.sent,
    );
    expect(find.text('Undo'), findsNothing);
    expect(find.textContaining('Sent'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('backgrounding sends an option before its Undo deadline', (
    tester,
  ) async {
    final transport = FakeReplyTransport();
    await _pump(tester, item: _item(_ask()), transport: transport);
    await tester.tap(find.text('Ship'));
    await tester.pump();
    expect(transport.sent, isEmpty);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
    await tester.pumpAndSettle();
    expect(transport.sent, hasLength(1));
    expect(transport.sent.single.optionIndex, 0);
  });

  testWidgets('unsupported hub shows choices without sending', (tester) async {
    final transport = FakeReplyTransport();
    await _pump(
      tester,
      item: _item(_ask()),
      transport: transport,
      supported: false,
    );
    await tester.tap(find.text('Ship'));
    await tester.pump(const Duration(seconds: 6));
    expect(transport.sent, isEmpty);
    expect(find.text('Undo'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  test(
    'text aliases and incomplete short choices preserve canonical indices',
    () {
      final row = _ask(short: false)
        ..remove('body')
        ..remove('recommended_option')
        ..addAll({
          'text': 'Full ask',
          'recommended': 'Defer',
          'hub_title': null,
          'hub_text': null,
          'hub_options': ['Only one'],
        });
      final item = _item(row);
      expect(item.body, 'Full ask');
      expect(item.optionLabel(1), 'Defer');
      expect(item.optionRecommended(1), isTrue);
    },
  );

  test('short option labels match canonical choices by key', () {
    final row = _ask()
      ..['option_keys'] = ['ship', 'defer']
      ..['hub_options'] = [
        {'key': 'defer', 'label': 'Later'},
        {'id': 'ship', 'text': 'Ship'},
      ]
      ..['hub_recommended'] = 'ship';
    final item = _item(row);
    expect(item.optionLabel(0), 'Ship');
    expect(item.optionLabel(1), 'Later');
    expect(item.optionRecommended(0), isTrue);
    expect(item.optionRecommended(1), isFalse);
  });

  test('unmatched keyed short options fall back to canonical labels', () {
    final row = _ask()
      ..['option_keys'] = ['ship', 'defer']
      ..['hub_options'] = [
        {'key': 'other-a', 'label': 'Alpha'},
        {'key': 'other-b', 'label': 'Beta'},
      ];
    final item = _item(row);
    expect(item.optionLabel(0), 'Approve');
    expect(item.optionLabel(1), 'Defer');
  });
}
