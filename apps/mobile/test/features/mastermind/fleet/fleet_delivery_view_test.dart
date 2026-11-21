import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_freshness_line.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_inbox_page.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_undelivered_row.dart';
import 'package:mobile/features/mastermind/iris/data/iris_models.dart';

import '../../../helpers/design_render_harness.dart';
import '../../../helpers/mastermind_fleet_fixture.dart';
import '../../../helpers/mastermind_view_harness.dart';

// Product rule: apps/docs/platform/features/mobile-mastermind.mdx#answer-delivery
void main() {
  late FakeFleetSource source;
  late MastermindViewHarness harness;
  late DateTime clock;

  setUp(() async {
    clock = fleetTestNow;
    source = FakeFleetSource();
    harness = MastermindViewHarness(
      fleet: FleetCubit(
        source: source,
        newKey: () => 'key-1',
        clock: () => clock,
        timer: inertFleetTimer,
      ),
    );
    await harness.setAccess(TestAccess.enabled);
  });

  tearDown(() => harness.dispose());

  Future<void> pump(WidgetTester tester, Widget child) async {
    DesignRender.setSize(tester, DesignRender.sizes['phone']!);
    final (settings, brightness) = DesignRender.themes['light']!;
    await tester.pumpWidget(
      DesignRenderApp(
        settings: settings,
        brightness: brightness,
        child: harness.wrap(child),
      ),
    );
    await tester.pump();
    await tester.pump();
  }

  const whatsapp = {
    'id': 'ship-fleet-sync',
    'title': 'Ship fleet sync to production?',
    'answeredVia': 'whatsapp',
    'resolvedAt': '2026-11-20T03:01:00.000Z',
  };

  testWidgets('the freshness line ticks from receivedAt and warns when stale', (
    tester,
  ) async {
    clock = DateTime.utc(2026, 11, 20, 3, 0, 12);
    await harness.runtime.fleet.refresh();
    await pump(
      tester,
      FleetFreshnessLine(state: harness.runtime.fleet.state, now: () => clock),
    );
    expect(find.text('Updated 12 s ago'), findsOneWidget);

    clock = clock.add(const Duration(seconds: 1));
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('Updated 13 s ago'), findsOneWidget);

    clock = DateTime.utc(2026, 11, 20, 3, 6);
    await tester.pump(const Duration(seconds: 1));
    expect(find.textContaining('publisher may be paused'), findsOneWidget);
  });

  testWidgets('an ask listed as resolved leaves Urgent for Answered', (
    tester,
  ) async {
    source.json = fleetSampleJson(resolved: [whatsapp]);
    await pump(tester, FleetInboxPage(now: () => clock));
    expect(find.text('Urgent'), findsNothing);
    expect(find.text('Ship now'), findsNothing);
    expect(find.text('Answered on WhatsApp'), findsOneWidget);
  });

  testWidgets('a reply that missed a closed ask is not delivered, not stuck', (
    tester,
  ) async {
    source.answerError = const ApiException(message: 'x', statusCode: 503);
    await pump(tester, FleetInboxPage(now: () => clock));
    await harness.runtime.fleet.answer(
      'ship-fleet-sync',
      FleetAnswerAction.reply,
      text: 'Already resolved',
    );
    await tester.pump();
    expect(find.textContaining('retrying in 5 s'), findsOneWidget);

    // A publisher that lags keeps the ask in decisions[]; resolved[] wins.
    source.json = fleetSampleJson(resolved: [whatsapp]);
    await harness.runtime.fleet.refresh();
    await tester.pump();
    expect(find.text('Urgent'), findsNothing);
    expect(find.text('Not delivered'), findsOneWidget);
    expect(
      find.text('This request closed before your answer arrived'),
      findsOneWidget,
    );
    expect(find.text('Already resolved'), findsOneWidget);
    expect(find.textContaining('Send to Iris'), findsNothing);

    await tester.tap(find.text('Dismiss'));
    await tester.pump();
    expect(find.text('Not delivered'), findsNothing);
  });

  testWidgets('an undelivered reply can go to Iris as a new note', (
    tester,
  ) async {
    final sent = <(String, String)>[];
    var dismissed = false;
    await pump(
      tester,
      FleetUndeliveredRow(
        answer: FleetPendingAnswer(
          action: FleetAnswerAction.reply,
          idempotencyKey: 'key-1',
          status: FleetSendStatus.closed,
          createdAt: fleetTestNow,
          title: 'Ship fleet sync to production?',
          text: 'Hold until Monday',
          reason: 'decision_closed',
        ),
        orchestrator: 'Iris',
        onDismiss: () => dismissed = true,
        sendNote: (text, {required idempotencyKey}) async {
          sent.add((text, idempotencyKey));
          return const IrisOk(
            IrisReceipt(id: 'r1', state: IrisReceiptState.pending),
          );
        },
      ),
    );
    await tester.tap(find.text('Send to Iris as a note'));
    await tester.pump();
    expect(sent.single, (
      'About "Ship fleet sync to production?": Hold until Monday',
      'key-1',
    ));
    expect(dismissed, isTrue);
  });
}
