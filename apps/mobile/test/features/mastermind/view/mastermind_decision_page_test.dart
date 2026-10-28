import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/mastermind/presentation/inbox_segment.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_decision_page.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';

import '../../../helpers/helpers.dart';
import '../../../helpers/mastermind_decisions_fixture.dart';
import '../../../helpers/mastermind_view_harness.dart';

void _surface(WidgetTester tester) {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = const Size(430, 3000);
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
}

Future<MastermindViewHarness> _pump(
  WidgetTester tester,
  Map<String, dynamic> json, {
  int id = 1,
  GoRouter? router,
}) async {
  _surface(tester);
  final harness = MastermindViewHarness(
    source: FakeHubSource(bytes: snapshotBytes(json)),
  );
  addTearDown(harness.dispose);
  await harness.setAccess(TestAccess.enabled);
  if (router == null) {
    await tester.pumpApp(
      harness.wrap(MastermindDecisionPage(decisionId: decisionId(id))),
    );
  } else {
    await tester.pumpAppRouter(router, wrap: harness.wrap);
  }
  await tester.pumpAndSettle();
  return harness;
}

Future<void> _publish(
  WidgetTester tester,
  MastermindViewHarness harness,
  Map<String, dynamic> json,
) async {
  harness.source.bytes = snapshotBytes(json);
  await harness.snapshot.refresh();
  await tester.pumpAndSettle();
}

Iterable<String> _allText(WidgetTester tester) =>
    tester.widgetList<Text>(find.byType(Text)).map((t) => t.data ?? '');

void main() {
  group('detail', () {
    testWidgets('shows why, decided by, reversible, risk and the rest', (
      tester,
    ) async {
      await _pump(
        tester,
        decisionsJson([
          decisionRow(
            1,
            title: 'Raise the cap',
            why: 'Usage doubled and the cap was binding.',
            by: 'role:architect',
            risk: 'high',
            category: 'delegated',
            area: 'quota',
            reversible: false,
            at: '2026-01-31T17:30:00+00:00',
          ),
        ]),
      );
      expect(
        tester
            .widget<ShellTitleOverride>(find.byType(ShellTitleOverride))
            .title,
        'Raise the cap',
      );
      expect(find.text('Why'), findsOneWidget);
      expect(
        find.text('Usage doubled and the cap was binding.'),
        findsOneWidget,
      );
      expect(find.text('Decided by'), findsOneWidget);
      // The role slug is shown verbatim.
      expect(find.text('Role: architect'), findsOneWidget);
      expect(find.text('Reversible'), findsOneWidget);
      expect(find.text('Not reversible'), findsOneWidget);
      expect(find.text('Risk: high'), findsOneWidget);
      expect(find.text('Delegated'), findsOneWidget);
      expect(find.text('Quota'), findsOneWidget);
      expect(find.text('Tuturuuu'), findsOneWidget);
      // Absolute time in GMT+7, never UTC.
      expect(find.text('Feb 1, 2026 00:30 GMT+7'), findsOneWidget);
    });

    testWidgets('names Mastermind and the user as deciders', (tester) async {
      await _pump(tester, decisionsJson([decisionRow(1)]));
      expect(find.text('Mastermind'), findsOneWidget);
      await _pump(tester, decisionsJson([decisionRow(1, by: 'user')]));
      expect(find.text('You'), findsWidgets);
      expect(find.text('Can be reversed'), findsOneWidget);
    });

    testWidgets('a decision with no recorded reason says so', (tester) async {
      await _pump(tester, decisionsJson([decisionRow(1, why: null)]));
      expect(find.text('No reason recorded'), findsOneWidget);
    });

    testWidgets('never shows ids, hashes or severity', (tester) async {
      await _pump(tester, decisionsJson([decisionRow(1)]));
      final text = _allText(tester).join('\n').toLowerCase();
      expect(text, isNot(contains('d_0')));
      expect(text, isNot(contains('severity')));
      expect(text, isNot(contains('security')));
    });

    testWidgets('has no reply controls: the journal is history', (
      tester,
    ) async {
      await _pump(tester, decisionsJson([decisionRow(1)]));
      expect(find.byType(TextField), findsNothing);
      expect(find.text('Send reply'), findsNothing);
    });
  });

  group('gone', () {
    testWidgets('an id the snapshot does not hold says so, not an error', (
      tester,
    ) async {
      await _pump(tester, decisionsJson([decisionRow(1)]), id: 9);
      expect(
        find.text('This decision is no longer in Mastermind'),
        findsOneWidget,
      );
      expect(find.text('Back to Decisions'), findsOneWidget);
      expect(find.text('Why'), findsNothing);
    });

    testWidgets('a needs-you item id is not a decision', (tester) async {
      final json = decisionsJson([decisionRow(1)]);
      await _pump(tester, json, id: 0x1234);
      expect(
        find.text('This decision is no longer in Mastermind'),
        findsOneWidget,
      );
    });

    testWidgets('a decision that leaves the snapshot says so', (tester) async {
      final harness = await _pump(tester, decisionsJson([decisionRow(1)]));
      expect(find.text('Why'), findsOneWidget);
      await _publish(
        tester,
        harness,
        decisionsJson([decisionRow(2)], skipped: 1),
      );
      expect(
        find.text('This decision is no longer in Mastermind'),
        findsOneWidget,
      );
      expect(find.text('Why'), findsNothing);
    });

    testWidgets('Back to Decisions opens the Decisions segment', (
      tester,
    ) async {
      final router = GoRouter(
        initialLocation: Routes.mastermindInboxDecisionPath(decisionId(9)),
        routes: [
          GoRoute(
            path: Routes.mastermindInboxDecision,
            builder: (_, state) => MastermindDecisionPage(
              decisionId: state.pathParameters['decisionId'] ?? '',
            ),
          ),
          GoRoute(
            path: Routes.mastermindInbox,
            builder: (_, state) => Text('inbox ${state.uri}'),
          ),
        ],
      );
      addTearDown(router.dispose);
      await _pump(tester, decisionsJson([decisionRow(1)]), router: router);
      await tester.tap(find.text('Back to Decisions'));
      await tester.pumpAndSettle();
      expect(
        find.text('inbox ${inboxLocation(segment: InboxSegment.decisions)}'),
        findsOneWidget,
      );
    });
  });

  group('updated', () {
    testWidgets('a changed decision shows the banner', (tester) async {
      final harness = await _pump(tester, decisionsJson([decisionRow(1)]));
      expect(find.text('This decision was updated'), findsNothing);
      await _publish(
        tester,
        harness,
        decisionsJson([decisionRow(1, why: 'A different reason.')]),
      );
      expect(find.text('This decision was updated'), findsOneWidget);
      expect(find.text('A different reason.'), findsOneWidget);
    });

    testWidgets('an unchanged republish shows no banner', (tester) async {
      final harness = await _pump(tester, decisionsJson([decisionRow(1)]));
      await _publish(
        tester,
        harness,
        decisionsJson([decisionRow(1), decisionRow(2)]),
      );
      expect(find.text('This decision was updated'), findsNothing);
      expect(find.text('Why'), findsOneWidget);
    });
  });
}
