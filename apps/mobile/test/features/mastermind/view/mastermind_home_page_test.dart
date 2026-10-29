import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/replies/reply_outcome.dart';
import 'package:mobile/features/mastermind/view/home/activity_strip.dart';
import 'package:mobile/features/mastermind/view/home_activity_card.dart';
import 'package:mobile/features/mastermind/view/home_needs_you_card.dart';
import 'package:mobile/features/mastermind/view/home_ship_card.dart';
import 'package:mobile/features/mastermind/view/mastermind_home_page.dart';
import 'package:mobile/l10n/gen/app_localizations_en.dart';

import '../../../helpers/helpers.dart';
import '../../../helpers/mastermind_home_fixture.dart';
import '../../../helpers/mastermind_replies_fixture.dart';
import '../../../helpers/mastermind_view_harness.dart';

void _surface(WidgetTester tester, Size size) {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = size;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
}

Future<MastermindViewHarness> _pumpHome(
  WidgetTester tester, {
  Map<String, dynamic>? json,
  Size size = const Size(430, 4000),
  double dockClearance = 0,
  MastermindRepliesCubit? replies,
}) async {
  _surface(tester, size);
  final harness = MastermindViewHarness(
    source: FakeHubSource(bytes: snapshotBytes(json ?? homeJson())),
    replies: replies,
  );
  addTearDown(harness.dispose);
  await harness.setAccess(TestAccess.enabled);
  await tester.pumpApp(
    harness.wrap(
      Builder(
        builder: (context) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(padding: EdgeInsets.only(bottom: dockClearance)),
          child: const MastermindHomePage(),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return harness;
}

double _top(WidgetTester tester, String text) =>
    tester.getTopLeft(find.text(text)).dy;

Iterable<String> _allText(WidgetTester tester) =>
    tester.widgetList<Text>(find.byType(Text)).map((text) => text.data ?? '');

void main() {
  group('Home order', () {
    testWidgets('activity counts come first, then the cards in spec order', (
      tester,
    ) async {
      await _pumpHome(tester);
      final order = [
        'Updated 00:30',
        'Running',
        'Needs you',
        'Ship · GitHub deployment',
        'Quota',
        'Activity',
        // Last: the latest few, with a link to the journal.
        'Recent decisions',
      ];
      final tops = [for (final label in order) _top(tester, label)];
      expect([...tops]..sort(), tops, reason: order.join(' < '));
      expect(tops.toSet(), hasLength(order.length));
    });

    testWidgets('shows three needs-you items, decisions first', (tester) async {
      await _pumpHome(tester);
      expect(find.text('First decision'), findsOneWidget);
      expect(find.text('Second decision'), findsOneWidget);
      expect(find.text('Action item'), findsOneWidget);
      expect(find.text('Fyi note'), findsNothing);
      expect(
        _top(tester, 'First decision') < _top(tester, 'Action item'),
        isTrue,
      );
      expect(find.text('Show all 4'), findsOneWidget);
    });

    testWidgets('shows the kind as a glyph and the product as a second line', (
      tester,
    ) async {
      await _pumpHome(tester);
      expect(find.byIcon(LucideIcons.diamond), findsNWidgets(2));
      expect(find.byIcon(LucideIcons.zap), findsOneWidget);
      expect(find.text('Tuturuuu'), findsWidgets);
      // The kind is a glyph now, not a chip repeating the title.
      expect(find.text('Decision'), findsNothing);
    });
  });

  group('pending replies', () {
    testWidgets('sit directly under Needs you, above Ship', (tester) async {
      final replies = repliesCubit(
        transport: FakeReplyTransport(const [ReplyUnavailable()]),
      );
      await replies.submit(item: parsedItem(inboxItem(1)), text: 'Hello');
      await _pumpHome(
        tester,
        json: inboxJson([inboxItem(1)]),
        replies: replies,
      );
      expect(find.text('1 reply waiting to send'), findsOneWidget);
      final waiting = _top(tester, '1 reply waiting to send');
      expect(waiting > _top(tester, 'Needs you'), isTrue);
      expect(waiting < tester.getTopLeft(find.byType(HomeShipCard)).dy, isTrue);
    });

    testWidgets('show nothing when none are waiting', (tester) async {
      await _pumpHome(tester);
      expect(find.textContaining('waiting to send'), findsNothing);
    });
  });

  group('activity tiles', () {
    Finder tile(String label) =>
        find.ancestor(of: find.text(label), matching: find.byType(InkWell));

    testWidgets('"0 failed" uses the neutral glyph, not a warning', (
      tester,
    ) async {
      final json = homeJson();
      (json['lanes'] as List<dynamic>).removeWhere(
        (lane) => (lane as Map<String, dynamic>)['state'] == 'failed',
      );
      await _pumpHome(tester, json: json);
      final failed = tile('Failed').first;
      expect(
        find.descendant(of: failed, matching: find.byIcon(LucideIcons.circleX)),
        findsOneWidget,
      );
      expect(
        find.descendant(of: failed, matching: find.byIcon(AppIcons.warning)),
        findsNothing,
      );
    });

    testWidgets('a non-zero failed count keeps the warning glyph', (
      tester,
    ) async {
      await _pumpHome(tester);
      expect(
        find.descendant(
          of: tile('Failed').first,
          matching: find.byIcon(AppIcons.warning),
        ),
        findsOneWidget,
      );
    });

    testWidgets('each tile is at least 44 by 72', (tester) async {
      await _pumpHome(tester, size: const Size(375, 4000));
      for (final element in find.byType(MastermindCountTile).evaluate()) {
        final size = (element.renderObject! as RenderBox).size;
        expect(size.width, greaterThanOrEqualTo(44));
        expect(size.height, greaterThanOrEqualTo(72));
      }
    });
  });

  group('security rows', () {
    testWidgets('render as one redacted line in a trailing group', (
      tester,
    ) async {
      await _pumpHome(tester);
      expect(find.text('Mastermind · security fix'), findsOneWidget);
      expect(find.text('Security'), findsOneWidget);
      // Trailing: after the last normal needs-you row and its Show all link.
      expect(_top(tester, 'Security') > _top(tester, 'Show all 4'), isTrue);
    });

    testWidgets('carry no severity, title, count or tap target', (
      tester,
    ) async {
      await _pumpHome(tester);
      final text = _allText(tester).join('\n').toLowerCase();
      expect(text, isNot(contains('severity')));
      expect(text, isNot(contains('critical')));
      expect(text, isNot(contains('security issue')));
      expect(
        find.ancestor(
          of: find.text('Mastermind · security fix'),
          matching: find.byType(InkWell),
        ),
        findsNothing,
      );
      // The group header has no count beside it.
      expect(find.textContaining('Security ('), findsNothing);
      expect(find.text('Security 1'), findsNothing);
    });

    testWidgets('never feed the Needs you count', (tester) async {
      await _pumpHome(tester);
      expect(find.text('Show all 4'), findsOneWidget);
      expect(find.text('Show all 5'), findsNothing);
    });

    testWidgets('alone, say nothing needs a reply and show the line', (
      tester,
    ) async {
      await _pumpHome(tester, json: homeJson(needsYou: false));
      expect(find.text('Nothing needs a reply'), findsOneWidget);
      expect(find.text("You're all caught up"), findsNothing);
      expect(find.text('Mastermind · security fix'), findsOneWidget);
      // Nothing to show beyond the cap.
      expect(find.textContaining('Show all'), findsNothing);
    });

    testWidgets('an empty export is all caught up with no Security group', (
      tester,
    ) async {
      await _pumpHome(tester, json: homeJson(security: false, needsYou: false));
      expect(find.text("You're all caught up"), findsOneWidget);
      expect(find.text('Security'), findsNothing);
      expect(find.byType(MastermindCountTile), findsNWidgets(4));
    });
  });

  group('cards', () {
    testWidgets('tiles read the fleet point; queued and silent are a note', (
      tester,
    ) async {
      final handle = tester.ensureSemantics();
      await _pumpHome(tester);
      // The fleet point says 1 running, not the 2 lanes marked running.
      expect(find.bySemanticsLabel('Running, 1'), findsOneWidget);
      expect(find.bySemanticsLabel('Waiting, 1'), findsOneWidget);
      expect(find.bySemanticsLabel('Idle, 1'), findsOneWidget);
      expect(find.bySemanticsLabel('Failed, 1'), findsOneWidget);
      expect(find.text('3 on you'), findsOneWidget);
      expect(
        tester.getSemantics(find.text('3 on you')),
        isSemantics(label: '3 on you', isButton: true, hasTapAction: true),
      );
      expect(
        find.text('From fleet reports · 1 queued · 1 not reporting'),
        findsOneWidget,
      );
      handle.dispose();
    });

    testWidgets('a failing environment is listed before the release rows', (
      tester,
    ) async {
      await _pumpHome(tester);
      expect(find.text('Tuturuuu web · Staging'), findsOneWidget);
      expect(find.text('Needs attention'), findsOneWidget);
      expect(find.text('Deploy failure · CI success'), findsOneWidget);
      expect(find.text('Live just now'), findsOneWidget);
      expect(
        _top(tester, 'Tuturuuu web · Staging') < _top(tester, 'Live just now'),
        isTrue,
      );
    });

    testWidgets('quota rows show the pool verbatim, pacing word and budget', (
      tester,
    ) async {
      await _pumpHome(tester);
      expect(find.text('Claude pool A'), findsOneWidget);
      expect(find.text('Session 1% left'), findsOneWidget);
      expect(find.text('SHORT'), findsOneWidget);
      expect(find.text('Reserve pacing (chart rule)'), findsOneWidget);
      expect(find.text('Usage'), findsOneWidget);
    });

    Map<String, dynamic> withPools(List<double?> sessions) {
      final json = homeJson();
      final usage =
          (json['observability'] as Map<String, dynamic>)['usage']
              as Map<String, dynamic>;
      final template =
          (usage['instances'] as List<dynamic>).first as Map<String, dynamic>;
      usage['instances'] = [
        for (final (i, session) in sessions.indexed)
          {
            ...template,
            'instance': 'Claude pool ${String.fromCharCode(65 + i)}',
            'session': {
              ...template['session'] as Map<String, dynamic>,
              'remaining_percent': session,
            },
          },
      ];
      return json;
    }

    Finder quotaCard(String row) => find
        .ancestor(of: find.text(row), matching: find.byType(AppGroupedSection))
        .first;
    final showAll = find.textContaining('Show all');

    testWidgets('all pools unreported: one row, no Show all', (tester) async {
      await _pumpHome(tester, json: withPools([null, null]));
      expect(find.text('Quota not reported'), findsOneWidget);
      expect(
        find.descendant(of: quotaCard('Quota not reported'), matching: showAll),
        findsNothing,
      );
    });

    testWidgets('a hidden pool that reports is not collapsed away', (
      tester,
    ) async {
      await _pumpHome(tester, json: withPools([null, null, null, 20]));
      expect(find.text('Quota not reported'), findsNothing);
      expect(
        find.descendant(of: quotaCard('Claude pool A'), matching: showAll),
        findsOneWidget,
      );
    });

    testWidgets('lists the three newest decisions in GMT+7', (tester) async {
      await _pumpHome(tester);
      expect(find.text('Decision log 3'), findsOneWidget);
      expect(find.text('Decision log 2'), findsOneWidget);
      expect(find.text('Decision log 1'), findsOneWidget);
      expect(find.text('Decision log 0'), findsNothing);
      expect(
        _top(tester, 'Decision log 3') < _top(tester, 'Decision log 1'),
        isTrue,
      );
      expect(find.textContaining('GMT+7'), findsWidgets);
    });

    testWidgets('lists the three newest events, newest first', (tester) async {
      await _pumpHome(tester);
      for (var seq = 8; seq >= 6; seq--) {
        expect(find.text('Lane event $seq'), findsOneWidget);
      }
      expect(find.text('Lane event 5'), findsNothing);
      expect(
        _top(tester, 'Lane event 8') < _top(tester, 'Lane event 6'),
        isTrue,
      );
    });
  });

  group('layout', () {
    testWidgets('the last card clears the dock', (tester) async {
      const height = 800.0;
      const dock = 120.0;
      await _pumpHome(
        tester,
        size: const Size(430, height),
        dockClearance: dock,
      );
      await tester.dragUntilVisible(
        find.text('Lane event 6'),
        find.byType(CustomScrollView),
        const Offset(0, -300),
      );
      await tester.drag(find.byType(CustomScrollView), const Offset(0, -2000));
      await tester.pumpAndSettle();
      final last = tester.getRect(find.byType(AppGroupedRow).last);
      expect(last.bottom, lessThanOrEqualTo(height - dock));
    });

    testWidgets('adds no AppBar or Back control of its own', (tester) async {
      await _pumpHome(tester);
      expect(find.byType(AppBar), findsNothing);
      expect(find.byType(BackButton), findsNothing);
      expect(find.byIcon(Icons.arrow_back), findsNothing);
    });
  });

  group('links into the other tabs', () {
    Future<List<String>> pumpRouted(WidgetTester tester) async {
      _surface(tester, const Size(430, 4000));
      final harness = MastermindViewHarness(
        source: FakeHubSource(bytes: snapshotBytes(homeJson())),
      );
      addTearDown(harness.dispose);
      await harness.setAccess(TestAccess.enabled);
      final visited = <String>[];
      final router = GoRouter(
        initialLocation: '/mastermind',
        routes: [
          GoRoute(
            path: '/mastermind',
            builder: (context, state) => const MastermindHomePage(),
          ),
          for (final path in [
            '/mastermind/inbox',
            '/mastermind/work',
            '/mastermind/ship',
            '/mastermind/insights',
          ])
            GoRoute(
              path: path,
              builder: (context, state) {
                visited.add(state.uri.toString());
                return const SizedBox.shrink();
              },
            ),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpAppRouter(router, wrap: harness.wrap);
      await tester.pumpAndSettle();
      return visited;
    }

    for (final entry in {
      'Show all 4': '/mastermind/inbox',
      'Failed': '/mastermind/work?state=failed',
      'Running': '/mastermind/work?state=running',
      'From fleet reports · 1 queued · 1 not reporting':
          '/mastermind/work?state=queued',
      'Usage': '/mastermind/insights',
      'See all decisions': '/mastermind/inbox?segment=decisions',
    }.entries) {
      testWidgets('${entry.key} opens ${entry.value}', (tester) async {
        final visited = await pumpRouted(tester);
        await tester.tap(find.text(entry.key));
        await tester.pumpAndSettle();
        expect(visited, [entry.value]);
      });
    }

    testWidgets('a count tile opens its lane list from the semantics tap', (
      tester,
    ) async {
      final handle = tester.ensureSemantics();
      final visited = await pumpRouted(tester);
      final node = tester.getSemantics(find.bySemanticsLabel('Failed, 1'));
      expect(node.getSemanticsData().hasAction(SemanticsAction.tap), isTrue);
      tester.semantics.tap(find.semantics.byLabel('Failed, 1'));
      await tester.pumpAndSettle();
      expect(visited, ['/mastermind/work?state=failed']);
      handle.dispose();
    });

    testWidgets('a Needs-you row is tappable and Back returns to Home', (
      tester,
    ) async {
      _surface(tester, const Size(430, 4000));
      final harness = MastermindViewHarness(
        source: FakeHubSource(bytes: snapshotBytes(homeJson())),
      );
      addTearDown(harness.dispose);
      await harness.setAccess(TestAccess.enabled);
      final router = GoRouter(
        initialLocation: '/mastermind',
        routes: [
          GoRoute(
            path: '/mastermind',
            builder: (context, state) => const MastermindHomePage(),
          ),
          GoRoute(
            path: Routes.mastermindInboxItem,
            builder: (context, state) =>
                Text('detail ${state.pathParameters['itemId']}'),
          ),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpAppRouter(router, wrap: harness.wrap);
      await tester.pumpAndSettle();

      final row = find.ancestor(
        of: find.text('First decision'),
        matching: find.byType(AppGroupedRow),
      );
      expect(
        find.descendant(of: row, matching: find.byIcon(AppIcons.forward)),
        findsOneWidget,
      );
      await tester.tap(find.text('First decision'));
      await tester.pumpAndSettle();
      expect(find.textContaining('detail item-'), findsOneWidget);
      // Pushed over Home, so Back has somewhere to go.
      expect(router.canPop(), isTrue);
      router.pop();
      await tester.pumpAndSettle();
      expect(find.text('First decision'), findsOneWidget);
    });
  });

  group('eventSummary', () {
    final l10n = AppLocalizationsEn();
    SnapshotEvent event(EventPayload payload) => SnapshotEvent(
      seq: 1,
      ts: DateTime.utc(2026),
      kind: EventKind.needsYou,
      payload: payload,
    );

    test('collapses a security payload to the constant-label line', () {
      expect(
        eventSummary(
          l10n,
          event(
            const SecurityItem(
              title: 'Security issue',
              state: LaneState.open,
              product: Product.upskii,
            ),
          ),
        ),
        'Mastermind · security fix',
      );
      expect(
        eventSummary(
          l10n,
          event(
            const SecurityItem(title: 'Security issue', state: LaneState.open),
          ),
        ),
        'Mastermind · security fix',
      );
    });

    test('security lines carry the constant label for every product (S3)', () {
      for (final product in [null, ...Product.values]) {
        final line = securityLine(
          l10n,
          SecurityItem(
            title: 'Security issue',
            state: LaneState.open,
            product: product,
          ),
        );
        expect(line, 'Mastermind · security fix', reason: '$product');
      }
    });
  });
}
