import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/deep_links.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/components/app_chip.dart';
import 'package:mobile/features/mastermind/presentation/inbox_segment.dart';

import '../../../helpers/mastermind_decisions_fixture.dart';
import '../../../helpers/mastermind_home_fixture.dart';
import '../../../helpers/mastermind_view_harness.dart';
import '../../../helpers/mastermind_work_pump.dart';

// 16:30 UTC is 23:30 GMT+7 and 17:30 UTC is 00:30 the next day in GMT+7, so
// two decisions an hour apart in UTC land on different GMT+7 days.
final List<Map<String, dynamic>> _rows = [
  decisionRow(
    1,
    title: 'Older day',
    at: '2026-01-30T05:00:00+00:00',
    product: 'Mastermind',
    reversible: false,
  ),
  decisionRow(2, title: 'Late night', at: '2026-01-31T16:30:00+00:00'),
  decisionRow(
    3,
    title: 'Just after midnight',
    at: '2026-01-31T17:30:00+00:00',
    product: 'Mastermind',
  ),
  decisionRow(
    4,
    title: 'Same day later',
    at: '2026-01-31T18:30:00+00:00',
    reversible: false,
  ),
];

String get _decisionsUrl => inboxLocation(segment: InboxSegment.decisions);

Future<GoRouter> _pump(
  WidgetTester tester,
  Map<String, dynamic> json, {
  String initial = '${Routes.mastermindInbox}?segment=decisions',
}) async {
  final router = workRouter(initial);
  await pumpWork(tester, json, router: router);
  return router;
}

double _top(WidgetTester tester, String text) =>
    tester.getTopLeft(find.text(text)).dy;

Iterable<String> _allText(WidgetTester tester) => tester
    .widgetList<Text>(find.byType(Text))
    .map((t) => t.data ?? '')
    .where((t) => t.isNotEmpty);

void main() {
  group('list', () {
    testWidgets('is newest first, grouped by GMT+7 day', (tester) async {
      await _pump(tester, decisionsJson(_rows));
      // Two days: Feb 1 holds the two decisions after 17:00 UTC.
      expect(find.text('Feb 1, 2026'), findsOneWidget);
      expect(find.text('Jan 31, 2026'), findsOneWidget);
      expect(find.text('Jan 30, 2026'), findsOneWidget);
      final order = [
        'Feb 1, 2026',
        'Same day later',
        'Just after midnight',
        'Jan 31, 2026',
        'Late night',
        'Jan 30, 2026',
        'Older day',
      ];
      final tops = [for (final label in order) _top(tester, label)];
      expect([...tops]..sort(), tops, reason: order.join(' < '));
      expect(tops.toSet(), hasLength(order.length));
    });

    testWidgets('shows the GMT+7 time of each decision', (tester) async {
      await _pump(tester, decisionsJson(_rows));
      expect(find.text('01:30'), findsOneWidget); // 18:30 UTC
      expect(find.text('00:30'), findsOneWidget); // 17:30 UTC
      expect(find.text('23:30'), findsOneWidget); // 16:30 UTC
    });

    testWidgets('orders decisions at the same instant by id', (tester) async {
      await _pump(
        tester,
        decisionsJson([
          decisionRow(9, title: 'Nine'),
          decisionRow(5, title: 'Five'),
        ]),
      );
      expect(_top(tester, 'Five') < _top(tester, 'Nine'), isTrue);
    });

    testWidgets('shows category, risk as text and product on each row', (
      tester,
    ) async {
      await _pump(
        tester,
        decisionsJson([
          decisionRow(1, risk: 'high', category: 'delegated'),
          decisionRow(2, risk: 'med', category: 'user', title: 'Second'),
        ]),
      );
      expect(find.text('Risk: high'), findsOneWidget);
      expect(find.text('Risk: medium'), findsOneWidget);
      expect(find.text('Delegated'), findsOneWidget);
      expect(find.text('You'), findsOneWidget);
    });

    testWidgets('says how many older decisions the snapshot left out', (
      tester,
    ) async {
      await _pump(tester, decisionsJson(_rows, skipped: 12));
      expect(
        find.text("12 older decisions aren't included in this snapshot."),
        findsOneWidget,
      );
    });

    testWidgets('uses the singular for one skipped decision', (tester) async {
      await _pump(tester, decisionsJson(_rows, skipped: 1));
      expect(
        find.text("1 older decision isn't included in this snapshot."),
        findsOneWidget,
      );
    });

    testWidgets('has no footer when nothing was skipped', (tester) async {
      await _pump(tester, decisionsJson(_rows));
      expect(find.textContaining('older decision'), findsNothing);
    });

    testWidgets('says so when no decision was recorded', (tester) async {
      await _pump(tester, decisionsJson([]));
      expect(find.text('No decisions recorded yet.'), findsOneWidget);
    });
  });

  group('filters', () {
    testWidgets('a product chip narrows the journal', (tester) async {
      await _pump(tester, decisionsJson(_rows));
      await tester.tap(find.widgetWithText(AppChip, 'Mastermind'));
      await tester.pumpAndSettle();
      expect(find.text('Older day'), findsOneWidget);
      expect(find.text('Just after midnight'), findsOneWidget);
      expect(find.text('Late night'), findsNothing);
      expect(find.text('Same day later'), findsNothing);
      // Days with nothing left disappear with their decisions.
      expect(find.text('Jan 31, 2026'), findsNothing);
      await tester.tap(find.widgetWithText(AppChip, 'All'));
      await tester.pumpAndSettle();
      expect(find.text('Late night'), findsOneWidget);
    });

    testWidgets('the reversible chips split the journal', (tester) async {
      await _pump(tester, decisionsJson(_rows));
      await tester.tap(find.widgetWithText(AppChip, 'Reversible'));
      await tester.pumpAndSettle();
      expect(find.text('Late night'), findsOneWidget);
      expect(find.text('Just after midnight'), findsOneWidget);
      expect(find.text('Older day'), findsNothing);
      expect(find.text('Same day later'), findsNothing);

      await tester.tap(find.widgetWithText(AppChip, 'Not reversible'));
      await tester.pumpAndSettle();
      expect(find.text('Older day'), findsOneWidget);
      expect(find.text('Same day later'), findsOneWidget);
      expect(find.text('Late night'), findsNothing);

      // Tapping the selected chip clears it.
      await tester.tap(find.widgetWithText(AppChip, 'Not reversible'));
      await tester.pumpAndSettle();
      expect(find.text('Late night'), findsOneWidget);
    });

    testWidgets('both filters combine', (tester) async {
      await _pump(tester, decisionsJson(_rows));
      await tester.tap(find.widgetWithText(AppChip, 'Mastermind'));
      await tester.tap(find.widgetWithText(AppChip, 'Reversible'));
      await tester.pumpAndSettle();
      expect(find.text('Just after midnight'), findsOneWidget);
      expect(find.text('Older day'), findsNothing);
      expect(find.text('Late night'), findsNothing);
    });

    testWidgets('a combination with no match says so and can be cleared', (
      tester,
    ) async {
      await _pump(
        tester,
        decisionsJson([
          decisionRow(1, title: 'Tuturuuu reversible'),
          decisionRow(2, title: 'Mastermind reversible', product: 'Mastermind'),
          decisionRow(
            3,
            title: 'Tuturuuu fixed',
            reversible: false,
            at: '2026-01-31T09:00:00+00:00',
          ),
        ]),
      );
      await tester.tap(find.widgetWithText(AppChip, 'Mastermind'));
      await tester.tap(find.widgetWithText(AppChip, 'Not reversible'));
      await tester.pumpAndSettle();
      expect(find.text('No matching decisions'), findsOneWidget);
      await tester.tap(find.widgetWithText(AppChip, 'Not reversible'));
      await tester.pumpAndSettle();
      expect(find.text('Mastermind reversible'), findsOneWidget);
    });

    testWidgets('offers no chip that could not split the journal', (
      tester,
    ) async {
      await _pump(
        tester,
        decisionsJson([decisionRow(1), decisionRow(2, title: 'Two')]),
      );
      expect(find.byType(AppChip), findsNothing);
    });

    testWidgets('a filter whose chip left the data is dropped', (tester) async {
      final router = workRouter('${Routes.mastermindInbox}?segment=decisions');
      final harness = await pumpWork(
        tester,
        decisionsJson(_rows),
        router: router,
      );
      await tester.tap(find.widgetWithText(AppChip, 'Mastermind'));
      await tester.pumpAndSettle();
      expect(find.text('Late night'), findsNothing);

      harness.source.bytes = snapshotBytes(
        decisionsJson([decisionRow(1, title: 'Only Tuturuuu left')]),
      );
      await harness.snapshot.refresh();
      await tester.pumpAndSettle();
      expect(find.text('Only Tuturuuu left'), findsOneWidget);
      expect(find.byType(AppChip), findsNothing);
    });
  });

  group('segment', () {
    testWidgets('keeps the segment in the URL, Needs you being the bare tab', (
      tester,
    ) async {
      final router = await _pump(
        tester,
        decisionsJson(_rows),
        initial: Routes.mastermindInbox,
      );
      String location() => workUri(router).toString();

      expect(find.text('Decision 1'), findsNothing);
      await tester.tap(find.text('Decisions').first);
      await tester.pumpAndSettle();
      expect(location(), _decisionsUrl);
      expect(_decisionsUrl, '${Routes.mastermindInbox}?segment=decisions');
      expect(find.text('Late night'), findsOneWidget);

      await tester.tap(find.text('Needs you'));
      await tester.pumpAndSettle();
      expect(location(), Routes.mastermindInbox);
      expect(find.text('Late night'), findsNothing);
    });

    testWidgets('switching segments does not walk the Back stack', (
      tester,
    ) async {
      final router = await _pump(
        tester,
        decisionsJson(_rows),
        initial: Routes.mastermindInbox,
      );
      for (final label in ['Decisions', 'Needs you', 'Decisions']) {
        await tester.tap(find.text(label).first);
        await tester.pumpAndSettle();
      }
      // `go`, never a push: nothing was stacked for Back to walk through.
      expect(router.canPop(), isFalse);
    });

    testWidgets('opens on the segment the URL names', (tester) async {
      for (final (query, expectDecisions) in [
        ('decisions', true),
        ('needs-you', false),
        ('nonsense', false),
      ]) {
        await _pump(
          tester,
          decisionsJson(_rows),
          initial: '${Routes.mastermindInbox}?segment=$query',
        );
        expect(
          find.text('Late night'),
          expectDecisions ? findsOneWidget : findsNothing,
          reason: query,
        );
      }
    });

    testWidgets('keeps the filters while switching segments', (tester) async {
      await _pump(tester, decisionsJson(_rows));
      await tester.tap(find.widgetWithText(AppChip, 'Mastermind'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Needs you').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Decisions').first);
      await tester.pumpAndSettle();
      expect(find.text('Late night'), findsNothing);
      expect(find.text('Older day'), findsOneWidget);
    });
  });

  group('navigation', () {
    testWidgets('a row pushes the detail by opaque id', (tester) async {
      final router = await _pump(tester, decisionsJson(_rows));
      await tester.tap(find.text('Late night'));
      await tester.pumpAndSettle();
      expect(
        workUri(router).path,
        Routes.mastermindInboxDecisionPath(decisionId(2)),
      );
      expect(
        Routes.isMastermindInboxDecisionLocation(workUri(router).path),
        isTrue,
      );
      expect(router.canPop(), isTrue);
    });

    testWidgets('Back returns to the filtered Decisions segment', (
      tester,
    ) async {
      final router = await _pump(tester, decisionsJson(_rows));
      await tester.tap(find.widgetWithText(AppChip, 'Mastermind'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Just after midnight'));
      await tester.pumpAndSettle();
      expect(find.text('Why'), findsOneWidget);

      router.pop();
      await tester.pumpAndSettle();
      expect(workUri(router).toString(), _decisionsUrl);
      expect(find.text('Just after midnight'), findsOneWidget);
      expect(find.text('Late night'), findsNothing);
    });

    test('route helpers encode the id and recognise only decisions', () {
      expect(
        Routes.mastermindInboxDecisionPath('d_a/b'),
        '/mastermind/inbox/decision/d_a%2Fb',
      );
      expect(
        Routes.isMastermindInboxDecisionLocation(
          Routes.mastermindInboxDecisionPath('d_1'),
        ),
        isTrue,
      );
      expect(
        Routes.isMastermindInboxDecisionLocation(
          '${Routes.mastermindInboxDecisionPath('d_1')}/',
        ),
        isTrue,
      );
      for (final other in [
        Routes.mastermindInbox,
        _decisionsUrl,
        Routes.mastermindInboxItemPath('item-1'),
        Routes.mastermindWorkLanePath('item-1'),
      ]) {
        expect(Routes.isMastermindInboxDecisionLocation(other), isFalse);
      }
      expect(
        Routes.isMastermindInboxItemLocation(
          Routes.mastermindInboxDecisionPath('d_1'),
        ),
        isFalse,
      );
    });
  });

  group('deep links', () {
    test('open the Inbox tab root and never carry a decision id', () {
      final link = resolveMobileDeepLink(
        Uri.parse(
          'https://tuturuuu.com/personal/mastermind/inbox/decision/'
          '${decisionId(1)}',
        ),
      );
      expect(link?.location, Routes.mastermindInbox);
      expect(link?.location, isNot(contains('d_')));
    });
  });

  group('Home', () {
    testWidgets('See all decisions opens the Decisions segment', (
      tester,
    ) async {
      final router = workRouter(Routes.mastermind);
      await pumpWork(tester, decisionsJson(_rows), router: router);
      await tester.tap(find.text('See all decisions'));
      await tester.pumpAndSettle();
      expect(workUri(router).toString(), _decisionsUrl);
      expect(find.text('Older day'), findsOneWidget);
      expect(find.text('Decisions'), findsWidgets);
    });

    testWidgets('a decision row opens its detail over Home', (tester) async {
      final router = workRouter(Routes.mastermind);
      await pumpWork(tester, decisionsJson(_rows), router: router);
      await tester.tap(find.text('Same day later'));
      await tester.pumpAndSettle();
      expect(
        workUri(router).path,
        Routes.mastermindInboxDecisionPath(decisionId(4)),
      );
      // Pushed over Home, so Back has somewhere to go.
      router.pop();
      await tester.pumpAndSettle();
      expect(workUri(router).path, Routes.mastermind);
      expect(find.text('Recent decisions'), findsOneWidget);
    });

    testWidgets('with no decisions there is nothing to open', (tester) async {
      final router = workRouter(Routes.mastermind);
      await pumpWork(tester, decisionsJson([]), router: router);
      expect(find.text('See all decisions'), findsNothing);
    });
  });

  group('redaction', () {
    testWidgets('shows no ids, hashes, severity or security rows', (
      tester,
    ) async {
      final json = homeJson()..['decisions'] = _rows;
      await _pump(tester, json);
      final text = _allText(tester).join('\n').toLowerCase();
      expect(text, isNot(contains('d_0')));
      expect(text, isNot(contains('item-')));
      expect(text, isNot(contains('severity')));
      // The Needs-you security group lives on the other segment only.
      expect(text, isNot(contains('security')));
      expect(find.text('Security'), findsNothing);
    });

    testWidgets('the security rows stay out of the Decisions counts', (
      tester,
    ) async {
      final json = homeJson()..['decisions'] = _rows;
      await _pump(tester, json);
      // Day counts only: 2, 1 and 1 decisions.
      expect(find.text('2'), findsOneWidget);
      expect(find.text('1'), findsNWidgets(2));
    });
  });
}
