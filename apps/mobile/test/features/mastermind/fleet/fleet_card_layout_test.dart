import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/view/detail/fleet_option_carousel.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_compact_card.dart';

import '../../../helpers/design_render_harness.dart';
import '../../../helpers/mastermind_fleet_fixture.dart';

FleetDecision _decision({String recommended = 'later'}) => FleetDecision.parse({
  'id': 'upskii-studio-sudo',
  'title': 'Upskii: MacStudio1 password needed to finish the test machine',
  'body':
      "Upskii's database update is held until MacStudio1 can run its full "
      'test suite.\n\n- Run the prepared install script yourself\n'
      '- Or pick a password card',
  'urgency': 'high',
  'requester': 'Upskii',
  'options': [
    {
      'id': 'script',
      'label': "I'll run the script myself",
      'description': 'You run it on MacStudio1; setup continues after.',
    },
    {'id': 'card', 'label': 'Password card'},
    {'id': 'later', 'label': 'Later'},
  ],
  'recommendedOptionId': recommended,
  'createdAt': '2026-11-20T02:40:00.000Z',
})!;

// Product rule: apps/docs/platform/features/mobile-mastermind.mdx#fleet-inbox
void main() {
  Future<void> pump(
    WidgetTester tester,
    Widget child, {
    double textScale = 1,
  }) async {
    DesignRender.setSize(tester, DesignRender.sizes['phone']!);
    final (settings, brightness) = DesignRender.themes['dark']!;
    await tester.pumpWidget(
      DesignRenderApp(
        settings: settings,
        brightness: brightness,
        child: MediaQuery(
          data: MediaQueryData(
            size: const Size(390, 844),
            textScaler: TextScaler.linear(textScale),
          ),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Align(alignment: Alignment.topCenter, child: child),
          ),
        ),
      ),
    );
    await tester.pump();
  }

  group('compact card', () {
    testWidgets('shows the title, summary and recommended option', (
      tester,
    ) async {
      await pump(
        tester,
        FleetCompactCard(
          decision: _decision(),
          onTap: () {},
          now: () => fleetTestNow,
        ),
      );
      expect(
        find.text(
          'Upskii: MacStudio1 password needed to finish the test machine',
        ),
        findsOneWidget,
      );
      expect(
        find.textContaining("Upskii's database update is held"),
        findsOneWidget,
      );
      expect(
        find.text('Recommended Later', findRichText: true),
        findsOneWidget,
      );
      expect(find.text('3 options'), findsOneWidget);
      // The full body and the option list live in the detail page.
      expect(find.text("I'll run the script myself"), findsNothing);
    });

    for (final scale in [1.0, 1.6]) {
      testWidgets('keeps one size when idle, sending, sent or failed '
          'at ${scale}x text', (tester) async {
        final sizes = <FleetCardStatus, Size>{};
        for (final status in FleetCardStatus.values) {
          await pump(
            tester,
            FleetCompactCard(
              key: ValueKey(status),
              decision: _decision(),
              status: status,
              answer: 'Later',
              onRetry: () {},
              onTap: () {},
              now: () => fleetTestNow,
            ),
            textScale: scale,
          );
          expect(tester.takeException(), isNull, reason: '$status');
          sizes[status] = tester.getSize(find.byType(FleetCompactCard));
        }
        expect(sizes.values.toSet(), hasLength(1), reason: '$sizes');
      });
    }

    test('the summary drops list and emphasis markers', () {
      expect(
        fleetDecisionSummary(_decision()),
        "Upskii's database update is held until MacStudio1 can run its full "
        'test suite. Run the prepared install script yourself Or pick a '
        'password card',
      );
    });
  });

  group('option carousel', () {
    List<FleetChoice> choices(FleetDecision decision) => [
      for (final (index, option) in decision.options.indexed)
        FleetChoice(
          number: index + 1,
          label: option.label,
          optionId: option.id,
          description: option.description,
          recommended: option.id == decision.recommendedOptionId,
          action: FleetAnswerAction.approve,
        ),
    ];

    testWidgets('keeps canonical order and marks the recommended option', (
      tester,
    ) async {
      final sent = <FleetChoice>[];
      await pump(
        tester,
        FleetOptionCarousel(
          choices: choices(_decision()),
          orchestrator: 'Iris',
          onSend: sent.add,
        ),
      );
      // Option 1 opens first, even though option 3 is recommended.
      expect(find.text("I'll run the script myself"), findsOneWidget);
      expect(find.text('1 of 3'), findsOneWidget);
      expect(
        find.text('You run it on MacStudio1; setup continues after.'),
        findsOneWidget,
      );

      await tester.drag(find.byType(PageView), const Offset(-400, 0));
      await tester.pumpAndSettle();
      await tester.drag(find.byType(PageView), const Offset(-400, 0));
      await tester.pumpAndSettle();
      expect(find.text('3 of 3'), findsOneWidget);
      final recommended = find.ancestor(
        of: find.text('Later'),
        matching: find.byType(FleetOptionCard),
      );
      expect(
        find.descendant(of: recommended, matching: find.text('Recommended')),
        findsOneWidget,
      );

      // Choose turns into Cancel and Send in place; Send sends once.
      await tester.tap(
        find.descendant(
          of: recommended,
          matching: find.text('Choose this option'),
        ),
      );
      await tester.pump();
      expect(sent, isEmpty);
      await tester.tap(find.text('Send to Iris'));
      await tester.pump();
      expect(sent.single.optionId, 'later');
    });

    testWidgets('swiping away cancels a pending confirm', (tester) async {
      final sent = <FleetChoice>[];
      await pump(
        tester,
        FleetOptionCarousel(
          choices: choices(_decision()),
          orchestrator: 'Iris',
          onSend: sent.add,
        ),
      );
      await tester.tap(find.text('Choose this option').first);
      await tester.pump();
      expect(find.text('Send to Iris'), findsOneWidget);
      await tester.drag(find.byType(PageView), const Offset(-400, 0));
      await tester.pumpAndSettle();
      expect(find.text('Send to Iris'), findsNothing);
      expect(sent, isEmpty);
    });

    testWidgets('the choice slot keeps one size in every state', (
      tester,
    ) async {
      final sizes = <FleetChoiceSlotState, Size>{};
      for (final state in FleetChoiceSlotState.values) {
        await pump(
          tester,
          SizedBox(
            width: 320,
            child: FleetChoiceSlot(
              key: ValueKey(state),
              state: state,
              orchestrator: 'Iris',
              recommended: true,
              onChoose: () {},
              onCancel: () {},
              onSend: () {},
              onRetry: () {},
            ),
          ),
          textScale: 1.3,
        );
        expect(tester.takeException(), isNull, reason: '$state');
        sizes[state] = tester.getSize(find.byType(FleetChoiceSlot));
      }
      expect(sizes.values.toSet(), hasLength(1), reason: '$sizes');
      // The cards around it are as tall as the tallest one.
      await pump(
        tester,
        FleetOptionCarousel(
          choices: choices(_decision()),
          orchestrator: 'Iris',
          onSend: (_) {},
        ),
      );
      final before = tester.getSize(find.byType(FleetOptionCarousel));
      await tester.tap(find.text('Choose this option').first);
      await tester.pump();
      expect(tester.getSize(find.byType(FleetOptionCarousel)), before);
      expect(find.byType(AppButton), findsWidgets);
    });
  });
}
