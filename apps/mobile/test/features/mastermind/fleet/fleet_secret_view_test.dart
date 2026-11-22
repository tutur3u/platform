import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_secret_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_reply_step_up.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_pairing.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_pins.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_secret_card.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_secret_field.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_secret_page.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/pump_app.dart';

import 'secret_test_support.dart';

// Design: apps/docs/build/devops/mastermind-secret-entry.mdx#phone-hygiene
void main() {
  final now = DateTime.utc(2026, 11, 22, 10, 5);
  final signerKey =
      (secretFixture['request'] as Map<String, dynamic>)['signerKey'] as String;

  TextField field(WidgetTester tester) => tester.widget<TextField>(
    find.byKey(const ValueKey('fleet-secret-field')),
  );

  group('secure field', () {
    testWidgets('is obscured, unassisted and has no clipboard', (tester) async {
      await tester.pumpApp(FleetSecretField(onSubmit: (_) {}));
      await tester.pump();
      final input = field(tester);
      expect(input.obscureText, isTrue);
      expect(input.autocorrect, isFalse);
      expect(input.enableSuggestions, isFalse);
      expect(input.enableIMEPersonalizedLearning, isFalse);
      expect(input.keyboardType, TextInputType.visiblePassword);
      expect(input.smartDashesType, SmartDashesType.disabled);
      expect(input.smartQuotesType, SmartQuotesType.disabled);
      expect(input.autofillHints, isNull);
      expect(input.enableInteractiveSelection, isFalse);
      expect(input.contextMenuBuilder, isNotNull);
      final editable = tester.widget<EditableText>(find.byType(EditableText));
      expect(editable.selectionEnabled, isFalse);
    });

    testWidgets('caps the value at 4096 UTF-8 bytes', (tester) async {
      await tester.pumpApp(FleetSecretField(onSubmit: (_) {}));
      await tester.pump();
      await tester.enterText(find.byType(TextField), 'a' * 4096);
      expect(field(tester).controller!.text.length, 4096);
      await tester.enterText(find.byType(TextField), 'é' * 2049);
      await tester.pump();
      expect(field(tester).controller!.text.length, 4096);
      expect(fleetSecretUtf8Length('é' * 2048), 4096);
    });

    testWidgets('hands the bytes over once and clears', (tester) async {
      final sent = <Uint8List>[];
      await tester.pumpApp(FleetSecretField(onSubmit: sent.add));
      await tester.pump();
      await tester.enterText(find.byType(TextField), 'disposable');
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('fleet-secret-send')));
      await tester.pump();
      expect(utf8.decode(sent.single), 'disposable');
      expect(field(tester).controller!.text, isEmpty);
    });

    testWidgets('clears when the app leaves the foreground', (tester) async {
      await tester.pumpApp(FleetSecretField(onSubmit: (_) {}));
      await tester.pump();
      await tester.enterText(find.byType(TextField), 'disposable');
      await tester.setAppLifecycle(AppLifecycleState.inactive);
      await tester.pump();
      expect(field(tester).controller!.text, isEmpty);
      await tester.setAppLifecycle(AppLifecycleState.resumed);
    });
  });

  group('page', () {
    late FakeSecretPlatform platform;
    late FleetSecretPins pins;
    late RecordingSecretSource source;

    setUp(() {
      FlutterSecureStorage.setMockInitialValues({});
      SharedPreferences.setMockInitialValues(secretTestPrefs());
      platform = FakeSecretPlatform()..install();
      pins = FleetSecretPins(
        userId: () => 'user-1',
        storage: const FlutterSecureStorage(),
      );
      source = RecordingSecretSource();
    });
    tearDown(() => platform.uninstall());

    /// Starts the flow under real async (the fake platform's Ed25519
    /// needs it), then shows the page over it.
    Future<FleetSecretCubit> pumpPage(
      WidgetTester tester,
      FleetDecision decision,
    ) async {
      final cubit = FleetSecretCubit(
        decision: decision,
        crypto: platform.crypto(),
        pins: pins,
        source: source,
        accountId: () => 'user-1',
        now: () => now,
        attempts: FleetPairingAttempts(),
      );
      await tester.runAsync(cubit.start);
      tester.view
        ..physicalSize = const Size(800, 3000)
        ..devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpApp(
        FleetSecretPage(
          decision: decision,
          now: () => now,
          laneTitle: 'Secret entry lane',
          stepUp: FleetReplyStepUp.using(
            verifyCode: (_) async => true,
            verifyDevice: (_) async {},
            deviceRegistered: () async => false,
          ),
          create: () => cubit,
        ),
      );
      await tester.pump();
      return cubit;
    }

    Future<void> pinActive(WidgetTester tester) => tester.runAsync(() async {
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
    });

    testWidgets('shows verified fields and the field only after step-up', (
      tester,
    ) async {
      await pinActive(tester);
      final decision = (await tester.runAsync(signedRequestDecision))!;
      await pumpPage(tester, decision);
      expect(find.text('Skora M4'), findsOneWidget);
      expect(find.text('"it\'s"'), findsOneWidget);
      expect(find.text('""'), findsOneWidget);
      expect(find.textContaining('Secret entry lane'), findsOneWidget);
      expect(find.byKey(const ValueKey('fleet-secret-field')), findsNothing);
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
    });

    testWidgets('a closed request removes the field', (tester) async {
      await pinActive(tester);
      final decision = (await tester.runAsync(signedRequestDecision))!;
      final cubit = await pumpPage(tester, decision);
      cubit.stepUpVerified();
      await tester.pump();
      await tester.pump();
      await tester.enterText(
        find.byKey(const ValueKey('fleet-secret-field')),
        'disposable',
      );
      await tester.runAsync(
        () => eraseFleetSecretKeys(crypto: platform.crypto(), pins: pins),
      );
      await tester.pump();
      await tester.pump();
      expect(cubit.state.phase, FleetSecretPhase.closed);
      expect(find.byKey(const ValueKey('fleet-secret-field')), findsNothing);
      expect(
        find.byKey(const ValueKey('fleet-secret-status-closed')),
        findsOneWidget,
      );
    });

    testWidgets('a blocked request shows why and no input', (tester) async {
      final decision = (await tester.runAsync(
        () => signedRequestDecision(id: 'secret-ffffffffffffffffffffffff'),
      ))!;
      await pumpPage(tester, decision);
      expect(
        find.byKey(const ValueKey('fleet-secret-status-blocked')),
        findsOneWidget,
      );
      expect(find.byKey(const ValueKey('fleet-secret-field')), findsNothing);
      expect(find.text('Skora M4'), findsNothing);
    });
  });

  testWidgets('the card names the kind, purpose and machine', (tester) async {
    var opened = 0;
    final decision = (await tester.runAsync(signedRequestDecision))!;
    await tester.pumpApp(
      FleetSecretCard(
        decision: decision,
        machineLabel: 'Skora M4',
        now: () => now,
        onOpen: () => opened++,
      ),
    );
    await tester.pump();
    expect(find.text('Secret request'), findsOneWidget);
    expect(find.text('Mật khẩu sudo MacStudio1'), findsOneWidget);
    expect(find.text('Skora M4'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('fleet-secret-open')));
    expect(opened, 1);
  });
}
