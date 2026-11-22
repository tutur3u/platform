import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_secret_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_reply_step_up.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_pairing.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_pins.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_secret_page.dart';

import '../../../helpers/design_render_harness.dart';
import 'secret_test_support.dart';

// Kept in its own file: FleetSecretPins serialises storage through a static
// chain, so a pins call left pending by another test's fake-async zone would
// stall this render.
void main() {
  setUpAll(() => DesignRender.loadFonts(forGoldens: true));

  final now = DateTime.utc(2026, 11, 22, 10, 5);
  final signerKey =
      (secretFixture['request'] as Map<String, dynamic>)['signerKey'] as String;

  testWidgets('renders the opened secret entry flow in dark', (tester) async {
    FlutterSecureStorage.setMockInitialValues({});
    final platform = FakeSecretPlatform()..install();
    addTearDown(platform.uninstall);
    final pins = FleetSecretPins(
      userId: () => 'user-1',
      storage: const FlutterSecureStorage(),
    );
    final decision = (await tester.runAsync(signedRequestDecision))!;
    await tester.runAsync(() async {
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
    final cubit = FleetSecretCubit(
      decision: decision,
      crypto: platform.crypto(),
      pins: pins,
      source: RecordingSecretSource(),
      accountId: () => 'user-1',
      now: () => now,
      attempts: FleetPairingAttempts(),
    );
    await tester.runAsync(cubit.start);
    DesignRender.setSize(tester, DesignRender.sizes['phone']!);
    final (settings, brightness) = DesignRender.themes['dark']!;
    await tester.pumpWidget(
      DesignRenderApp(
        settings: settings,
        brightness: brightness,
        child: FleetSecretPage(
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
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(find.text('Skora M4'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await DesignRender.capture(tester, 'mastermind-fleet/secret-page-dark');
  });
}
