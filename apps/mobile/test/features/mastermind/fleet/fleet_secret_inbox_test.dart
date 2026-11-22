import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_reply_step_up.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_crypto.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_pins.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_inbox_page.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_secret_card.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_secret_page.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/design_render_harness.dart';
import '../../../helpers/fleet_router_harness.dart';
import '../../../helpers/mastermind_fleet_fixture.dart';
import '../../../helpers/mastermind_view_harness.dart';
import 'secret_test_support.dart';

void main() {
  setUpAll(() => DesignRender.loadFonts(forGoldens: true));

  final now = DateTime.utc(2026, 11, 22, 10, 5);
  final signerKey =
      (secretFixture['request'] as Map<String, dynamic>)['signerKey'] as String;

  late FakeSecretPlatform platform;
  late FleetSecretPins pins;
  late RecordingSecretSource secretSource;
  late FakeFleetSource fleetSource;
  late MastermindViewHarness harness;

  Future<void> setUpHarness({
    required List<Map<String, dynamic>> decisions,
    Map<String, dynamic> answers = const {},
    List<Map<String, dynamic>>? resolved,
  }) async {
    SharedPreferences.setMockInitialValues(secretTestPrefs());
    FlutterSecureStorage.setMockInitialValues({});
    platform = FakeSecretPlatform()..install();
    pins = FleetSecretPins(
      userId: () => 'user-1',
      storage: const FlutterSecureStorage(),
    );
    secretSource = RecordingSecretSource();
    fleetSource = FakeFleetSource(
      json: fleetSampleJson(
        decisions: decisions,
        answers: answers,
        resolved: resolved,
        receivedAt: '2026-11-22T10:03:00.000Z',
      ),
    );
    harness = MastermindViewHarness(
      fleet: FleetCubit(
        source: fleetSource,
        newKey: () => 'key-1',
        timer: inertFleetTimer,
        clock: () => now,
      ),
      userId: () => 'user-1',
    );
    await harness.setAccess(TestAccess.enabled);
  }

  tearDown(() async {
    platform.uninstall();
    await harness.dispose();
  });

  Future<void> pinActive() async {
    await pins.putPending(
      machineId: 'skr-m4',
      signerKey: signerKey,
      label: 'Skora M4',
      pairingId: 'pair-0123456789abcdef01234567',
      now: now,
      expiresAt: now.add(const Duration(minutes: 10)),
    );
    await pins.activate(
      machineId: 'skr-m4',
      pairingId: 'pair-0123456789abcdef01234567',
      signerKey: signerKey,
      clock: () => now,
    );
  }

  Map<String, dynamic> ordinaryAsk() => {
    'id': 'ship-fleet-sync',
    'title': 'Ship fleet sync to production?',
    'body': 'Web endpoints and the publisher are green on main.',
    'urgency': 'urgent',
    'options': [
      {'id': 'now', 'label': 'Ship now'},
      {'id': 'tonight', 'label': 'Tonight'},
    ],
    'recommendedOptionId': 'now',
    'createdAt': '2026-11-22T09:40:00.000Z',
    'deadlineAt': '2026-11-22T17:00:00.000Z',
  };

  Future<void> openSecret(BuildContext context, FleetDecision decision) =>
      showFleetSecretPage(
        context,
        decision: decision,
        crypto: platform.crypto(),
        pins: pins,
        source: secretSource,
        now: () => now,
        stepUp: FleetReplyStepUp.using(
          verifyCode: (_) async => true,
          verifyDevice: (_) async {},
          deviceRegistered: () async => false,
        ),
      );

  testWidgets('secret cards are on by default', (tester) async {
    expect(fleetSecretCardsReady, isTrue);
    final secret = await signedRequestDecision(resign: false);
    await setUpHarness(decisions: [decisionJson(secret), ordinaryAsk()]);
    await pumpFleetRoutes(
      tester,
      harness,
      now: () => now,
      openSecret: openSecret,
    );
    expect(
      find.byKey(ValueKey('fleet-secret-card-${secret.id}')),
      findsOneWidget,
    );
    expect(find.text('Needs you 2'), findsOneWidget);
  });

  testWidgets('gate-false path keeps secret requests hidden from Inbox', (
    tester,
  ) async {
    final secret = await signedRequestDecision(resign: false);
    await setUpHarness(decisions: [decisionJson(secret), ordinaryAsk()]);
    await pumpFleetRoutes(
      tester,
      harness,
      now: () => now,
      secretCardsReady: false,
    );
    expect(find.byType(FleetSecretCard), findsNothing);
    expect(find.text('Secret requests'), findsNothing);
    expect(find.text('Needs you 1'), findsOneWidget);
    expect(find.text(secret.title), findsNothing);
  });

  testWidgets(
    'secret card is distinct, has no ordinary controls, and never enters '
    'decision swipe or detail',
    (tester) async {
      final secret = await signedRequestDecision(resign: false);
      await setUpHarness(decisions: [decisionJson(secret), ordinaryAsk()]);
      final router = await pumpFleetRoutes(
        tester,
        harness,
        now: () => now,
        openSecret: openSecret,
      );

      expect(find.text('Needs you 2'), findsOneWidget);
      expect(find.text('Secret requests'), findsOneWidget);
      final card = find.byKey(ValueKey('fleet-secret-card-${secret.id}'));
      expect(card, findsOneWidget);
      expect(
        find.descendant(of: card, matching: find.text('Secret request')),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: card,
          matching: find.textContaining('End-to-end encrypted'),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(of: card, matching: find.text(secret.title)),
        findsOneWidget,
      );
      expect(
        find.descendant(of: card, matching: find.text('M4')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: card, matching: find.text('Provide')),
        findsOneWidget,
      );
      for (final ordinary in const [
        'Approve',
        'Hold',
        'Reply',
        'Snooze',
        'Choose this option',
      ]) {
        expect(
          find.descendant(of: card, matching: find.text(ordinary)),
          findsNothing,
        );
      }

      // Ordinary detail swipe/step order skips the secret request.
      await tester.tap(find.text('Ship fleet sync to production?'));
      await tester.pumpAndSettle();
      expect(find.text('1 of 1'), findsOneWidget);

      // A direct ask route still keeps the secret request closed.
      router.go(Routes.mastermindFleetDecisionPath(secret.id));
      await tester.pumpAndSettle();
      expect(find.text('This decision is closed'), findsOneWidget);
      expect(find.text('Back to Inbox'), findsOneWidget);
    },
  );

  testWidgets(
    'tapping a secret card opens showFleetSecretPage; closing without '
    'answering keeps it; completing removes it from Inbox',
    (tester) async {
      final secret = await tester.runAsync(signedRequestDecision);
      await setUpHarness(decisions: [decisionJson(secret!), ordinaryAsk()]);
      await tester.runAsync(pinActive);
      await pumpFleetRoutes(
        tester,
        harness,
        now: () => now,
        openSecret: openSecret,
      );

      // Tapping the card title opens the full-screen secret page.
      await tester.tap(find.text(secret.title));
      await tester.pump();
      await tester.runAsync(() => Future<void>.delayed(Duration.zero));
      await tester.pumpAndSettle();
      expect(find.byType(FleetSecretPage), findsOneWidget);
      expect(find.text('Skora M4'), findsOneWidget);

      // Closing without sending keeps the card open in Needs you.
      await tester.tap(find.byTooltip('Close'));
      await tester.pumpAndSettle();
      expect(find.byType(FleetSecretPage), findsNothing);
      expect(
        find.byKey(ValueKey('fleet-secret-card-${secret.id}')),
        findsOneWidget,
      );
      expect(find.text('Needs you 2'), findsOneWidget);

      // Tapping Provide opens the flow; completing removes it from Inbox.
      await tester.tap(find.byKey(const ValueKey('fleet-secret-open')));
      await tester.pump();
      await tester.runAsync(() => Future<void>.delayed(Duration.zero));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('projects-step-up-code')),
        '123456',
      );
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('projects-step-up-verify')));
      for (var i = 0; i < 4; i++) {
        await tester.pump();
      }
      expect(find.byKey(const ValueKey('fleet-secret-field')), findsOneWidget);
      await tester.enterText(
        find.byKey(const ValueKey('fleet-secret-field')),
        'disposable-secret',
      );
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('fleet-secret-send')));
      await tester.pump();
      await tester.runAsync(() => Future<void>.delayed(Duration.zero));
      await tester.pump();
      expect(secretSource.answers, hasLength(1));
      expect(secretSource.answers.single['action'], 'secret');
      expect(
        find.byKey(const ValueKey('fleet-secret-status-sent')),
        findsOneWidget,
      );

      // Closing returns to Inbox where the secret card is gone, and History
      // never lists it.
      await tester.tap(find.byTooltip('Close'));
      await tester.pumpAndSettle();
      expect(
        find.byKey(ValueKey('fleet-secret-card-${secret.id}')),
        findsNothing,
      );
      expect(find.text('Needs you 1'), findsOneWidget);

      await tester.tap(find.text('History'));
      await tester.pumpAndSettle();
      expect(find.text(secret.title), findsNothing);
    },
  );

  testWidgets('default Inbox entry invokes showFleetSecretPage cleanly', (
    tester,
  ) async {
    final pairing = pairDecision();
    await setUpHarness(decisions: [decisionJson(pairing)]);
    await pumpFleetRoutes(tester, harness, now: () => now);
    expect(find.text('Pair machine'), findsOneWidget);
    expect(find.text('Pair'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('fleet-secret-open')));
    await tester.pumpAndSettle();
    expect(find.byType(FleetSecretPage), findsOneWidget);
  });

  testWidgets('secret and pair cards fit 320 px at 2x text in Vietnamese', (
    tester,
  ) async {
    final secret = await signedRequestDecision(resign: false);
    final pairing = pairDecision();
    await setUpHarness(
      decisions: [decisionJson(secret), decisionJson(pairing), ordinaryAsk()],
    );
    await pumpFleetRoutes(
      tester,
      harness,
      now: () => now,
      openSecret: openSecret,
      size: const Size(320, 720),
      textScale: 2,
      locale: const Locale('vi'),
    );
    expect(tester.takeException(), isNull);
    expect(find.text('Cần bạn 3'), findsOneWidget);
    expect(find.text('Yêu cầu bí mật'), findsWidgets);
  });

  for (final theme in ['light', 'dark']) {
    testWidgets('renders Inbox with secret card in $theme', (tester) async {
      final secret = await signedRequestDecision(resign: false);
      await setUpHarness(decisions: [decisionJson(secret), ordinaryAsk()]);
      DesignRender.setSize(tester, DesignRender.sizes['phone']!);
      final (settings, brightness) = DesignRender.themes[theme]!;
      await tester.pumpWidget(
        DesignRenderApp(
          settings: settings,
          brightness: brightness,
          child: harness.wrap(
            FleetInboxPage(now: () => now, openSecret: openSecret),
          ),
        ),
      );
      await tester.pump();
      await tester.pump();
      expect(tester.takeException(), isNull);
      await DesignRender.capture(
        tester,
        'mastermind-fleet/inbox-secret-$theme',
      );
    });
  }
}
