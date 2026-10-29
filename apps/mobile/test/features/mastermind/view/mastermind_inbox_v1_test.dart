import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/components/app_alert.dart';
import 'package:mobile/core/ui/components/app_tap_target.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/inbox_segment.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/replies/reply_outcome.dart';
import 'package:mobile/features/mastermind/view/inbox/inbox_item_tile.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_inbox_page.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_item_page.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_segmented_control.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';

import '../../../helpers/helpers.dart';
import '../../../helpers/mastermind_home_fixture.dart';
import '../../../helpers/mastermind_replies_fixture.dart';
import '../../../helpers/mastermind_view_harness.dart';

final _fixture = File('test/fixtures/mastermind/forge_v1_redacted.json');

const _openId = 'item-f23ae309c10a83c168e3';
const _resolvedId = 'item-abe540ef7c23733cd622';

/// The Forge v1 fixture, re-dated around the harness clock so ages read as
/// they would on the day: published a minute ago, resolved two hours ago.
Map<String, dynamic> _v1() {
  final json = jsonDecode(_fixture.readAsStringSync()) as Map<String, dynamic>;
  json['generated_at'] = _iso(testNow.subtract(const Duration(minutes: 1)));
  for (final row in json['decisions_resolved'] as List<dynamic>) {
    (row as Map<String, dynamic>)['resolved_at'] = _iso(
      testNow.subtract(const Duration(hours: 2)),
    );
  }
  return json;
}

/// The wire form: `+00:00`, never `Z`.
String _iso(DateTime value) =>
    value.toUtc().toIso8601String().replaceFirst('Z', '+00:00');

List<dynamic> _needsYou(Map<String, dynamic> json) =>
    (json['now'] as Map<String, dynamic>)['needs_you'] as List<dynamic>;

/// Forge v1 publishes each open ask twice, in `now.needs_you` and in
/// `decisions[]`, and the adapter keeps the `decisions[]` copy. An edit to an
/// open ask goes to both.
void _editOpen(
  Map<String, dynamic> json,
  void Function(Map<String, dynamic> row) edit,
) {
  for (final row in [..._needsYou(json), ...json['decisions'] as List]) {
    if (row is Map<String, dynamic> && row['id'] == _openId) edit(row);
  }
}

/// Drops the open asks from both places the fixture lists them.
void _removeOpen(Map<String, dynamic> json, {String? id}) {
  bool drop(Object? row) =>
      row is Map<String, dynamic> &&
      '${row['id']}'.startsWith('item-') &&
      (id == null || row['id'] == id);
  _needsYou(json).removeWhere(drop);
  (json['decisions'] as List).removeWhere(drop);
}

/// [count] extra open decisions, so a group runs past its cap.
void _addDecisions(Map<String, dynamic> json, int count) {
  _needsYou(json).addAll([
    for (var i = 1; i <= count; i++)
      inboxItem(100 + i, title: 'Extra decision $i', product: null),
  ]);
}

Future<MastermindViewHarness> _pump(
  WidgetTester tester,
  Widget page,
  Map<String, dynamic> json, {
  Size size = const Size(430, 4000),
  double dock = 0,
  double textScale = 1,
  MastermindRepliesCubit? replies,
  ShellChromeActionsCubit? chrome,
}) async {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = size;
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetPhysicalSize);
  final harness = MastermindViewHarness(
    source: FakeHubSource(bytes: snapshotBytes(json)),
    replies: replies,
  );
  addTearDown(harness.dispose);
  await harness.setAccess(TestAccess.enabled);
  Widget child = Builder(
    builder: (context) => MediaQuery(
      data: MediaQuery.of(context).copyWith(
        padding: EdgeInsets.only(bottom: dock),
        textScaler: TextScaler.linear(textScale),
      ),
      child: page,
    ),
  );
  if (chrome != null) {
    child = BlocProvider<ShellChromeActionsCubit>.value(
      value: chrome,
      child: child,
    );
  }
  await tester.pumpApp(harness.wrap(child));
  await tester.pumpAndSettle();
  expect(tester.takeException(), isNull);
  return harness;
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

void main() {
  setUpAll(initializeDateFormatting);

  group('filters', () {
    testWidgets('Needs you and Resolved split the fixture asks', (
      tester,
    ) async {
      await _pump(tester, const MastermindInboxPage(), _v1());
      expect(find.byType(InboxItemTile), findsNWidgets(2));
      expect(find.text('Decisions for you'), findsOneWidget);
      expect(find.text('Recently resolved'), findsNothing);

      await _segment(tester, 'Resolved');
      expect(find.byType(InboxItemTile), findsNWidgets(2));
      // Resolved rows group under their GMT+7 day and read the time.
      expect(find.text('Jan 31, 2026'), findsOneWidget);
      expect(find.text('Resolved · Yes · 22:32'), findsNWidgets(2));

      expect(inboxSegmentFromQuery('all'), InboxSegment.needsYou);
      expect(find.text('All'), findsNothing);
    });

    testWidgets('the segment control is compact with 44 pt segments', (
      tester,
    ) async {
      // Wide enough for the test font, whose glyphs are one em wide.
      await _pump(
        tester,
        const MastermindInboxPage(),
        _v1(),
        size: const Size(800, 4000),
      );
      final control = find.byType(MastermindSegmentedControl<InboxSegment>);
      expect(tester.getSize(control).height, lessThanOrEqualTo(48));
      for (final label in ['Needs you', 'Resolved', 'Decisions']) {
        final hit = find.ancestor(
          of: find.text(label),
          matching: find.byType(GestureDetector),
        );
        expect(tester.getSize(hit.first).height, greaterThanOrEqualTo(44));
      }
    });

    testWidgets('an empty Resolved view says why', (tester) async {
      final json = _v1()..remove('decisions_resolved');
      await _pump(tester, const MastermindInboxPage(), json);
      await _segment(tester, 'Resolved');
      expect(find.text('Nothing resolved recently'), findsOneWidget);
      expect(
        find.text('Asks appear here once Mastermind records an answer.'),
        findsOneWidget,
      );
    });

    testWidgets('an empty Needs you says why', (tester) async {
      final json = _v1();
      _removeOpen(json);
      await _pump(tester, const MastermindInboxPage(), json);
      expect(find.text('Nothing needs you'), findsOneWidget);
      expect(
        find.text(
          'Mastermind lists an ask here when a lane needs your answer.',
        ),
        findsOneWidget,
      );
    });
  });

  group('search', () {
    testWidgets('the navbar reveals it; no match offers a clear row', (
      tester,
    ) async {
      final chrome = ShellChromeActionsCubit();
      addTearDown(chrome.close);
      await _pump(tester, const MastermindInboxPage(), _v1(), chrome: chrome);
      expect(find.byType(TextField), findsNothing);
      chrome.state
          .resolveForLocation(Routes.mastermindInbox)
          .singleWhere((action) => action.id == 'mastermind-inbox-search')
          .onPressed!();
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'zzz');
      await tester.pumpAndSettle();
      expect(find.text('No matching items'), findsOneWidget);
      expect(
        find.text('Nothing in this view matches your search or filter.'),
        findsOneWidget,
      );
      await tester.tap(find.text('Clear search and filters'));
      await tester.pumpAndSettle();
      expect(find.byType(InboxItemTile), findsNWidgets(2));
      expect(find.byType(TextField), findsNothing);
    });

    testWidgets('the navbar icon opens it and searches resolved asks too', (
      tester,
    ) async {
      final chrome = ShellChromeActionsCubit();
      addTearDown(chrome.close);
      final json = _v1();
      final resolved =
          (json['decisions_resolved'] as List<dynamic>).first
              as Map<String, dynamic>;
      resolved['resolution'] = 'Ship it';
      await _pump(tester, const MastermindInboxPage(), json, chrome: chrome);
      ShellActionSpec action() => chrome.state
          .resolveForLocation(Routes.mastermindInbox)
          .singleWhere((spec) => spec.id == 'mastermind-inbox-search');
      expect(action().icon, AppIcons.search);
      expect(action().tooltip, 'Search Inbox');

      action().onPressed!();
      await tester.pumpAndSettle();
      expect(find.byType(TextField), findsOneWidget);
      expect(action().icon, AppIcons.close);
      await _segment(tester, 'Resolved');
      await tester.enterText(find.byType(TextField), 'ship it');
      await tester.pumpAndSettle();
      expect(find.byType(InboxItemTile), findsOneWidget);
      expect(find.text('Resolved · Ship it · 22:32'), findsOneWidget);

      // Decisions has its own filters: no ask search there.
      await _segment(tester, 'Decisions');
      expect(find.byType(TextField), findsNothing);
      expect(chrome.state.resolveForLocation(Routes.mastermindInbox), isEmpty);
    });
  });

  group('caps', () {
    testWidgets('a group shows five, then Show all N expands it', (
      tester,
    ) async {
      final json = _v1();
      _addDecisions(json, 5);
      await _pump(tester, const MastermindInboxPage(), json);
      expect(find.byType(InboxItemTile), findsNWidgets(5));
      expect(find.text('Show all 7'), findsOneWidget);
      await tester.tap(find.text('Show all 7'));
      await tester.pumpAndSettle();
      expect(find.byType(InboxItemTile), findsNWidgets(7));
      expect(find.text('Show all 7'), findsNothing);
    });
  });

  group('rows', () {
    testWidgets('read as one node: kind, title, state, then the hint', (
      tester,
    ) async {
      final handle = tester.ensureSemantics();
      final json = _v1();
      _editOpen(json, (row) => row['title'] = 'Mastermind · hub · decision');
      await _pump(tester, const MastermindInboxPage(), json);
      // The first ask line is the title, so it is not read a second time.
      expect(
        find.bySemanticsLabel('Decision. Review the plan. open'),
        findsOneWidget,
      );
      expect(find.textContaining('Mastermind · hub ·'), findsNothing);
      final node = tester.getSemantics(
        find.bySemanticsLabel(RegExp('^Decision. Review the plan')),
      );
      expect(node.hint, 'Opens the ask');
      handle.dispose();
    });

    testWidgets('a sent reply reads Sent · waiting until the hub resolves', (
      tester,
    ) async {
      final replies = repliesCubit(
        transport: FakeReplyTransport(const [ReplyAccepted()]),
      );
      final json = _v1();
      final item = parsedSnapshot(
        json,
      ).now.needsYou.whereType<NeedsYou>().first;
      await replies.submit(item: item, text: 'Yes');
      final harness = await _pump(
        tester,
        const MastermindInboxPage(),
        json,
        replies: replies,
      );
      expect(find.text('Sent · waiting for Mastermind'), findsOneWidget);
      expect(find.textContaining('Resolved'), findsOneWidget); // the segment

      // The hub moves it into its resolved history: only now is it Resolved.
      final row = Map<String, dynamic>.from(_needsYou(json).first as Map);
      _removeOpen(json, id: row['id'] as String);
      (json['decisions_resolved'] as List<dynamic>).add({
        ...row,
        'state': 'answered',
        'status': 'resolved',
        'resolution': 'Yes',
        'resolved_at': _iso(testNow),
      });
      harness.source.bytes = snapshotBytes(json);
      await harness.snapshot.refresh();
      await tester.pumpAndSettle();
      expect(find.text('Sent · waiting for Mastermind'), findsNothing);
      await _segment(tester, 'Resolved');
      expect(find.byType(InboxItemTile), findsNWidgets(3));
    });
  });

  testWidgets('failed sends differ from queued replies', (tester) async {
    final replies = repliesCubit(
      transport: FakeReplyTransport(const [ReplyRejected()]),
    );
    final json = _v1();
    final item = parsedSnapshot(json).now.needsYou.whereType<NeedsYou>().first;
    await replies.submit(item: item, text: 'Yes');
    await _pump(tester, const MastermindInboxPage(), json, replies: replies);
    // Refused for good: no queued reply, so no promise that a tap retries.
    expect(find.text("Couldn't send · open to review"), findsOneWidget);
    expect(find.text('Not sent · tap to retry'), findsNothing);
    expect(find.text('Waiting to send'), findsNothing);
  });

  testWidgets('a queued offline reply says tapping retries', (tester) async {
    final transport = FakeReplyTransport(const [
      ReplyUnavailable(),
      ReplyUnavailable(),
    ]);
    final replies = repliesCubit(transport: transport);
    final json = _v1();
    final item = parsedSnapshot(json).now.needsYou.whereType<NeedsYou>().first;
    await replies.submit(item: item, text: 'Yes');
    await _pump(tester, const MastermindInboxPage(), json, replies: replies);
    expect(find.text('Not sent · tap to retry'), findsOneWidget);
  });

  testWidgets('a 401 stays behind the auth guard and promises no retry', (
    tester,
  ) async {
    final transport = FakeReplyTransport(const [ReplyUnauthorized()]);
    final replies = repliesCubit(transport: transport);
    final json = _v1();
    final item = parsedSnapshot(json).now.needsYou.whereType<NeedsYou>().first;
    await replies.submit(item: item, text: 'Yes');
    await _pump(tester, const MastermindInboxPage(), json, replies: replies);
    // The page's own flush skips an entry the session was refused for.
    expect(transport.sent, hasLength(1));
    expect(find.text("Couldn't send · open to review"), findsOneWidget);
    expect(find.text('Not sent · tap to retry'), findsNothing);
  });

  testWidgets('truncated asks disclose the Mac continuation', (tester) async {
    final json = _v1();
    _editOpen(json, (row) => row['ask_truncated'] = true);
    await _pump(tester, const MastermindItemPage(itemId: _openId), json);
    expect(find.text('Ask truncated; full text on the Mac'), findsOneWidget);
  });

  testWidgets('long recorded answers survive and expand', (tester) async {
    final json = _v1();
    final answer = List.filled(100, 'recorded answer').join(' ');
    for (final row in json['decisions_resolved'] as List) {
      if ((row as Map)['id'] == _resolvedId) row['resolution'] = answer;
    }
    expect(
      parsedSnapshot(
        json,
      ).resolvedItems.firstWhere((item) => item.id == _resolvedId).resolution,
      answer,
    );
    await _pump(tester, const MastermindItemPage(itemId: _resolvedId), json);
    expect(
      find.text('Mastermind closed this ask without recording an answer.'),
      findsNothing,
    );
    await tester.tap(find.text('Show full answer'));
    await tester.pumpAndSettle();
    final text = tester.widget<Text>(find.text('Answer: $answer'));
    expect(text.maxLines, isNull);
  });

  group('detail', () {
    testWidgets('shows the full ask text, titled by its kind', (tester) async {
      final json = _v1();
      final ask = List.filled(120, 'context').join(' ');
      _editOpen(json, (row) => row['ask_text'] = ask);
      await _pump(tester, const MastermindItemPage(itemId: _openId), json);
      expect(
        tester
            .widget<ShellTitleOverride>(find.byType(ShellTitleOverride))
            .title,
        'Decision',
      );
      expect(find.text('Review plan'), findsOneWidget);
      final paragraph = tester.renderObject<RenderParagraph>(
        find.descendant(of: find.text(ask), matching: find.byType(RichText)),
      );
      expect(paragraph.didExceedMaxLines, isFalse);
      expect(find.byType(AppAlert), findsNothing);
    });

    testWidgets('the Open on Mac stand-in becomes an info alert', (
      tester,
    ) async {
      final json = _v1();
      _editOpen(
        json,
        (row) => row
          ..['ask_text'] = 'Open on Mac to read the full ask and reply.'
          ..['body'] = 'Open on Mac to read the full ask and reply.',
      );
      await _pump(tester, const MastermindItemPage(itemId: _openId), json);
      expect(find.text('Full details are on the Mac'), findsOneWidget);
      expect(find.textContaining('Open on Mac to read'), findsNothing);
    });

    testWidgets('a resolved ask shows the hub outcome and no composer', (
      tester,
    ) async {
      await _pump(tester, const MastermindItemPage(itemId: _resolvedId), _v1());
      expect(find.text('Review the plan'), findsOneWidget);
      expect(find.text('Outcome'), findsOneWidget);
      expect(find.text('Resolved'), findsOneWidget);
      expect(find.text('Answer: Yes'), findsOneWidget);
      // Two hours before 17:32 UTC is 22:32 in GMT+7.
      expect(find.text('Jan 31, 22:32'), findsOneWidget);
      expect(find.byType(TextField), findsNothing);
      expect(find.text('This was answered or withdrawn'), findsNothing);
    });
  });

  group('targets and clearance', () {
    testWidgets('every tappable in the list is at least 44 pt', (tester) async {
      final json = _v1();
      _addDecisions(json, 5);
      _needsYou(
        json,
      ).add(inboxItem(200, title: 'Upskii ask', product: 'Upskii'));
      _needsYou(json).add(inboxItem(201, title: 'Web ask'));
      await _pump(tester, const MastermindInboxPage(), json);
      for (final element in find.byType(InkWell).evaluate()) {
        final size = (element.renderObject! as RenderBox).size;
        expect(size.height, greaterThanOrEqualTo(44));
        expect(size.width, greaterThanOrEqualTo(44));
      }
      final chips = find.byType(AppTapTarget);
      expect(chips, findsWidgets);
      for (final element in chips.evaluate()) {
        final size = (element.renderObject! as RenderBox).size;
        expect(size.height, greaterThanOrEqualTo(44));
      }
    });

    for (final scale in [1.0, 2.0]) {
      testWidgets('the last row clears the dock at text scale $scale', (
        tester,
      ) async {
        const size = Size(375, 667);
        const dock = 120.0;
        final json = _v1();
        _addDecisions(json, 3);
        await _pump(
          tester,
          const MastermindInboxPage(initialSegment: InboxSegment.resolved),
          json,
          size: size,
          dock: dock,
          textScale: scale,
        );
        await tester.drag(
          find.byType(CustomScrollView),
          const Offset(0, -20000),
        );
        await tester.pumpAndSettle();
        final last = find.byType(AppGroupedRow).last;
        expect(
          tester.getRect(last).bottom,
          lessThanOrEqualTo(size.height - dock - 8),
        );
        expect(last.hitTestable(), findsOneWidget);
      });
    }
  });
}
