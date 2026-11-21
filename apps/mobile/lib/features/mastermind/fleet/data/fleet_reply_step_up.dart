import 'package:mobile/data/repositories/auth_repository.dart';
import 'package:mobile/features/security/device_mfa/device_mfa_service.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

enum FleetStepUpResult {
  /// The session carries a new second-factor proof; retry the reply.
  verified,

  /// The owner dismissed the device unlock.
  cancelled,

  /// The code was wrong, no authenticator is enrolled, or it could not be
  /// checked. Nothing changed.
  failed,
}

/// Renews the second-factor proof of this session so a reply can be sent.
///
/// A reply needs a proof made recently, in this session. An account whose
/// sign-in policy is already satisfied is not asked again by the app's own
/// routing, so the reply composer asks here: every call verifies anew,
/// whatever assurance the session holds, and leaves the signed-in screen
/// where it is. After [FleetStepUpResult.verified], call
/// `FleetThreadReplyCubit.retry()`: the reply goes out under its own key.
class FleetReplyStepUp {
  FleetReplyStepUp({required AuthRepository auth, DeviceMfaService? device})
    : this.using(
        verifyCode: (code) async => (await auth.verifyMfaCode(code)).success,
        verifyDevice: (reason) =>
            (device ?? DeviceMfaService()).verifyAnew(reason: reason),
        deviceRegistered: () => (device ?? DeviceMfaService()).isRegistered(),
      );

  /// The three things it needs, for a caller that has them in another form.
  FleetReplyStepUp.using({
    required Future<bool> Function(String code) verifyCode,
    required Future<void> Function(String reason) verifyDevice,
    required Future<bool> Function() deviceRegistered,
  }) : _verifyCode = verifyCode,
       _verifyDevice = verifyDevice,
       _deviceRegistered = deviceRegistered;

  final Future<bool> Function(String code) _verifyCode;
  final Future<void> Function(String reason) _verifyDevice;
  final Future<bool> Function() _deviceRegistered;

  static final _sixDigits = RegExp(r'^\d{6}$');

  /// Whether this device is itself an authenticator, so [withDevice] can
  /// verify with a device unlock and no typed code.
  Future<bool> deviceRegistered() async {
    try {
      return await _deviceRegistered();
    } on Object {
      return false;
    }
  }

  /// Verifies this device's own factor, and only that one, after a device
  /// unlock shown with [reason].
  Future<FleetStepUpResult> withDevice({required String reason}) async {
    try {
      await _verifyDevice(reason);
      return FleetStepUpResult.verified;
    } on AuthException catch (error) {
      return error.code == 'device_verification_cancelled'
          ? FleetStepUpResult.cancelled
          : FleetStepUpResult.failed;
    } on Object {
      return FleetStepUpResult.failed;
    }
  }

  /// Verifies with a six-digit code from the owner's authenticator app.
  Future<FleetStepUpResult> withCode(String code) async {
    final digits = code.trim();
    if (!_sixDigits.hasMatch(digits)) return FleetStepUpResult.failed;
    try {
      return await _verifyCode(digits)
          ? FleetStepUpResult.verified
          : FleetStepUpResult.failed;
    } on Object {
      return FleetStepUpResult.failed;
    }
  }
}
