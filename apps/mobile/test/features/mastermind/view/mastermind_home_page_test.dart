import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/view/home_activity_card.dart';
import 'package:mobile/features/mastermind/view/mastermind_home_page.dart';
import 'package:mobile/l10n/gen/app_localizations_en.dart';

import '../../../helpers/helpers.dart';
import '../../../helpers/mastermind_home_fixture.dart';
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
}) async {
  _surface(tester, size);
  final harness = MastermindViewHarness(
    source: FakeHubSource(bytes: snapshotBytes(json ?? homeJson())),
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
    testWidgets('Needs you comes first, then the other cards in spec order', (
      tester,
    ) async {
      await _pumpHome(tester);
      final order = [
        'Updated Feb 1, 2026 00:30 GMT+7',
        'Needs you',
        'Lanes at a glance',
        'Ship',
        'Quota',
        'Recent decisions',
        'Activity',
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
      expect(find.text('See all (4)'), findsOneWidget);
    });

    testWidgets('shows kind and product chips on needs-you items', (
      tester,
    ) async {
      await _pumpHome(tester);
      expect(find.text('Decision'), findsWidgets);
      expect(find.text('Tuturuuu'), findsWidgets);
    });
  });

  group('security rows', () {
    testWidgets('render as one redacted line in a trailing group', (
      tester,
    ) async {
      await _pumpHome(tester);
      expect(find.text('Mastermind · security fix'), findsOneWidget);
      expect(find.text('Security'), findsOneWidget);
      // Trailing: after the last normal needs-you row and its See all link.
      expect(_top(tester, 'Security') > _top(tester, 'See all (4)'), isTrue);
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
      expect(find.text('See all (4)'), findsOneWidget);
      expect(find.text('See all (5)'), findsNothing);
    });

    testWidgets('alone, say nothing needs a reply and show the line', (
      tester,
    ) async {
      await _pumpHome(tester, json: homeJson(needsYou: false));
      expect(find.text('Nothing needs a reply'), findsOneWidget);
      expect(find.text("You're all caught up"), findsNothing);
      expect(find.text('Mastermind · security fix'), findsOneWidget);
      expect(find.textContaining('See all'), findsNothing);
    });

    testWidgets('an empty export is all caught up with no Security group', (
      tester,
    ) async {
      await _pumpHome(tester, json: homeJson(security: false, needsYou: false));
      expect(find.text("You're all caught up"), findsOneWidget);
      expect(find.text('Security'), findsNothing);
      expect(find.text('Lanes at a glance'), findsOneWidget);
    });
  });

  group('cards', () {
    testWidgets('lane chips count by state with text', (tester) async {
      await _pumpHome(tester);
      expect(find.text('2 running'), findsOneWidget);
      expect(find.text('1 waiting'), findsOneWidget);
      expect(find.text('1 queued'), findsOneWidget);
      expect(find.text('1 failed'), findsOneWidget);
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

    testWidgets('lists the five newest events, newest first', (tester) async {
      await _pumpHome(tester);
      for (var seq = 8; seq >= 4; seq--) {
        expect(find.text('Lane event $seq'), findsOneWidget);
      }
      expect(find.text('Lane event 3'), findsNothing);
      expect(
        _top(tester, 'Lane event 8') < _top(tester, 'Lane event 4'),
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
        find.text('Lane event 4'),
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
      'See all (4)': '/mastermind/inbox',
      '1 failed': '/mastermind/work?state=failed',
      'Usage': '/mastermind/insights',
      'Live just now': '/mastermind/ship',
    }.entries) {
      testWidgets('${entry.key} opens ${entry.value}', (tester) async {
        final visited = await pumpRouted(tester);
        await tester.tap(find.text(entry.key));
        await tester.pumpAndSettle();
        expect(visited, [entry.value]);
      });
    }
  });

  group('eventSummary', () {
    final l10n = AppLocalizationsEn();
    SnapshotEvent event(EventPayload payload) => SnapshotEvent(
      seq: 1,
      ts: DateTime.utc(2026),
      kind: EventKind.needsYou,
      payload: payload,
    );

    test('collapses a security payload to the fixed line', () {
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
        'Upskii · security fix',
      );
      expect(
        eventSummary(
          l10n,
          event(
            const SecurityItem(title: 'Security issue', state: LaneState.open),
          ),
        ),
        'Security fix',
      );
    });
  });
}
