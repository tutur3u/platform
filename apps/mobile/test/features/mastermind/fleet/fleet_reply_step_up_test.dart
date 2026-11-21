import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_reply_step_up.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

// Product rule: apps/docs/platform/features/mastermind-thread-replies.mdx
void main() {
  late List<String> verified;
  late bool accept;

  FleetReplyStepUp stepUp({
    Future<void> Function(String reason)? verifyDevice,
    Future<bool> Function()? deviceRegistered,
  }) => FleetReplyStepUp.using(
    verifyCode: (code) async {
      verified.add(code);
      return accept;
    },
    verifyDevice: verifyDevice ?? (_) async {},
    deviceRegistered: deviceRegistered ?? () async => true,
  );

  setUp(() {
    verified = [];
    accept = true;
  });

  test(
    'verifies a typed code anew, whatever the session already holds',
    () async {
      expect(await stepUp().withCode(' 654321 '), FleetStepUpResult.verified);
      // A second step-up verifies again; it never answers from the first.
      expect(await stepUp().withCode('654321'), FleetStepUpResult.verified);
      expect(verified, ['654321', '654321']);
    },
  );

  test('does not send anything that is not a six-digit code', () async {
    for (final code in ['', '12345', '1234567', '12 456', 'abcdef']) {
      expect(await stepUp().withCode(code), FleetStepUpResult.failed);
    }
    expect(verified, isEmpty);
  });

  test('reports a refused code, and a check that could not be made', () async {
    accept = false;
    expect(await stepUp().withCode('654321'), FleetStepUpResult.failed);
    final broken = FleetReplyStepUp.using(
      verifyCode: (_) async => throw const AuthException('network'),
      verifyDevice: (_) async => throw const AuthException('network'),
      deviceRegistered: () async => true,
    );
    expect(await broken.withCode('654321'), FleetStepUpResult.failed);
    expect(
      await broken.withDevice(reason: 'Send reply'),
      FleetStepUpResult.failed,
    );
  });

  test('verifies with the device factor alone, after its unlock', () async {
    final reasons = <String>[];
    final device = stepUp(verifyDevice: (reason) async => reasons.add(reason));
    expect(
      await device.withDevice(reason: 'Send reply'),
      FleetStepUpResult.verified,
    );
    expect(
      await device.withDevice(reason: 'Again'),
      FleetStepUpResult.verified,
    );
    // Each call verifies the device again, and no typed-code check runs,
    // which would try every enrolled authenticator in turn.
    expect(reasons, ['Send reply', 'Again']);
    expect(verified, isEmpty);
  });

  test('tells a dismissed unlock from a device that cannot verify', () async {
    final cancelled = stepUp(
      verifyDevice: (_) async => throw const AuthException(
        'Device verification cancelled',
        code: 'device_verification_cancelled',
      ),
    );
    expect(
      await cancelled.withDevice(reason: 'Send reply'),
      FleetStepUpResult.cancelled,
    );
    final unregistered = stepUp(
      verifyDevice: (_) async => throw const AuthException(
        'Register this device as an authenticator first',
      ),
      deviceRegistered: () async => false,
    );
    expect(
      await unregistered.withDevice(reason: 'Send reply'),
      FleetStepUpResult.failed,
    );
    expect(await unregistered.deviceRegistered(), isFalse);
    // Local storage that cannot be read is a device that is not registered.
    final unreadable = stepUp(
      deviceRegistered: () async => throw StateError('storage'),
    );
    expect(await unreadable.deviceRegistered(), isFalse);
    expect(await stepUp().deviceRegistered(), isTrue);
  });
}
