import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:mobile/features/mastermind/iris/data/iris_models.dart';
import 'package:mobile/features/mastermind/iris/data/iris_relay.dart';
import 'package:mobile/features/mastermind/iris/device/iris_key_codec.dart';

/// The key one enrolment offers: `publicKey` is base64url (unpadded) P-256
/// SPKI DER, `fingerprint` the lowercase sha256 hex of those DER bytes (the
/// relay recomputes it), `deviceId` the lowercase UUID the relay files it
/// under.
typedef IrisDeviceKeyMaterial = ({
  String deviceId,
  String publicKey,
  String fingerprint,
});

/// The device's side of enrolment. `IrisDeviceTrust` is the hardware key
/// (Secure Enclave or Keystore); the private key never leaves the device.
abstract interface class IrisDeviceIdentity {
  /// Whether this device already holds a confirmed enrolment.
  Future<bool> isEnrolled();

  /// Creates or reuses the key. Null when the device cannot hold one.
  Future<IrisDeviceKeyMaterial?> load();

  /// Remembers [enrolment] so the device may sign while it is pending.
  Future<void> pending(IrisEnrollment enrolment);

  /// Whether the owner has confirmed [enrolment] yet.
  Future<IrisDeviceStatus> check(IrisRelay relay, IrisEnrollment enrolment);

  /// Drops the key and any enrolment, so the next [load] offers a new key
  /// (and so a new device id).
  Future<void> forget();
}

/// Fixture builds only: a fixed synthetic key, so the enrol flow can run
/// against the fixture relay. Never a real key; a real relay refuses it.
final class FakeIrisDeviceIdentity implements IrisDeviceIdentity {
  const FakeIrisDeviceIdentity();

  /// A well-formed P-256 SPKI (fixed bytes, not a real curve point).
  static final Uint8List _spki = Uint8List.fromList([
    0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x02, //
    0x01, 0x06, 0x08, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x03, 0x01, 0x07, 0x03,
    0x42, 0x00, 0x04,
    ...List<int>.generate(64, (i) => 0xA0 ^ i),
  ]);

  @override
  Future<IrisDeviceKeyMaterial?> load() async {
    final fingerprint = sha256.convert(_spki).toString();
    return (
      deviceId: irisDeviceIdFor(fingerprint),
      publicKey: irisBase64Url(_spki),
      fingerprint: fingerprint,
    );
  }

  @override
  Future<bool> isEnrolled() async => false;

  @override
  Future<void> pending(IrisEnrollment enrolment) async {}

  @override
  Future<void> forget() async {}

  @override
  Future<IrisDeviceStatus> check(
    IrisRelay relay,
    IrisEnrollment enrolment,
  ) async =>
      (await relay.device(enrolment.deviceId)).valueOrNull?.status ??
      IrisDeviceStatus.pending;
}
