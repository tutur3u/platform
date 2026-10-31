import 'dart:convert';

import 'package:crypto/crypto.dart';

/// The device's public key for enrolment. The native Secure Enclave or
/// Keystore key implements this in a later lane; the private key never
/// leaves the device.
abstract interface class IrisDeviceIdentity {
  /// Null when the device cannot create a key.
  Future<({String publicKey, String fingerprint})?> load();
}

/// Fixture builds only: a fixed synthetic key, so the enrol flow can run
/// against the fixture relay. Never a real key.
final class FakeIrisDeviceIdentity implements IrisDeviceIdentity {
  const FakeIrisDeviceIdentity();

  static const _publicKey = 'synthetic-p256-public-key';

  @override
  Future<({String publicKey, String fingerprint})?> load() async => (
    publicKey: _publicKey,
    fingerprint: sha256.convert(utf8.encode(_publicKey)).toString(),
  );
}
