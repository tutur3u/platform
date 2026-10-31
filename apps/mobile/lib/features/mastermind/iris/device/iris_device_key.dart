import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter/services.dart';
import 'package:mobile/features/mastermind/iris/device/iris_key_codec.dart';

/// Why the device key could not do what was asked. The native side reports
/// only these codes; never a key, signature or signed byte.
enum IrisDeviceKeyError {
  /// No Secure Enclave or hardware Keystore (or Android before 11).
  unsupported,

  /// No strong biometric is set up, so no key can be bound to one.
  biometryUnavailable,

  /// The key was deleted or never created.
  noKey,

  /// The biometric set changed, so the OS destroyed the key's use.
  keyInvalidated,

  cancelled,
  lockout,

  /// The OS refused to show a prompt (app in the background, or no screen).
  interactionNotAllowed,

  /// Anything else, including a malformed reply.
  failed,
}

final class IrisDeviceKeyException implements Exception {
  const IrisDeviceKeyException(this.error);

  final IrisDeviceKeyError error;

  @override
  String toString() => 'IrisDeviceKeyException(${error.name})';
}

/// The hardware key the native side created. [spki] is DER
/// SubjectPublicKeyInfo; [fingerprint] is its sha256 hex, checked here.
final class IrisDeviceKeyInfo {
  const IrisDeviceKeyInfo({
    required this.spki,
    required this.fingerprint,
    required this.hardware,
  });

  final Uint8List spki;
  final String fingerprint;

  /// `secure_enclave`, `strongbox` or `tee`.
  final String hardware;
}

/// The `mobile/iris_device_key` method channel: `ensureKey`, `sign`,
/// `deleteKey` and `lock`. iOS: `IrisDeviceKey.swift`; Android:
/// `iris/IrisDeviceKey.kt`. See SECURITY.md next to this file.
class IrisDeviceKey {
  const IrisDeviceKey({
    MethodChannel channel = const MethodChannel('mobile/iris_device_key'),
  }) : _channel = channel;

  final MethodChannel _channel;

  static const Set<String> _hardware = {'secure_enclave', 'strongbox', 'tee'};

  /// Returns the key, creating it on first use. Refuses a reply whose SPKI
  /// is not an uncompressed P-256 point or whose fingerprint does not match.
  Future<IrisDeviceKeyInfo> ensureKey() async {
    final reply = await _invoke<Map<Object?, Object?>>('ensureKey');
    final publicKey = reply?['publicKey'];
    final fingerprint = reply?['fingerprint'];
    final hardware = reply?['hardware'];
    if (publicKey is! String ||
        fingerprint is! String ||
        hardware is! String ||
        !_hardware.contains(hardware)) {
      throw const IrisDeviceKeyException(IrisDeviceKeyError.failed);
    }
    final Uint8List spki;
    try {
      spki = base64.decode(publicKey);
    } on FormatException {
      throw const IrisDeviceKeyException(IrisDeviceKeyError.failed);
    }
    if (!isP256Spki(spki) || sha256.convert(spki).toString() != fingerprint) {
      throw const IrisDeviceKeyException(IrisDeviceKeyError.failed);
    }
    return IrisDeviceKeyInfo(
      spki: spki,
      fingerprint: fingerprint,
      hardware: hardware,
    );
  }

  /// A DER ECDSA-SHA256 signature over [data]. A [sensitive] sign always
  /// prompts for biometrics; otherwise a recent unlock (at most five
  /// minutes) may cover it. [reason] titles the prompt; [cancel] labels the
  /// Android prompt's cancel button.
  Future<Uint8List> sign(
    Uint8List data, {
    required bool sensitive,
    required String reason,
    required String cancel,
  }) async {
    final der = await _invoke<Uint8List>('sign', {
      'data': data,
      'sensitive': sensitive,
      'reason': reason,
      'cancel': cancel,
    });
    if (der == null) {
      throw const IrisDeviceKeyException(IrisDeviceKeyError.failed);
    }
    return der;
  }

  Future<void> deleteKey() => _invoke<void>('deleteKey');

  /// Ends the read session so the next sign prompts again.
  Future<void> lock() => _invoke<void>('lock');

  Future<T?> _invoke<T>(String method, [Object? arguments]) async {
    try {
      return await _channel.invokeMethod<T>(method, arguments);
    } on PlatformException catch (error) {
      throw IrisDeviceKeyException(
        _errors[error.code] ?? IrisDeviceKeyError.failed,
      );
    } on MissingPluginException {
      throw const IrisDeviceKeyException(IrisDeviceKeyError.unsupported);
    }
  }

  static const Map<String, IrisDeviceKeyError> _errors = {
    'unsupported': IrisDeviceKeyError.unsupported,
    'biometry_unavailable': IrisDeviceKeyError.biometryUnavailable,
    'no_key': IrisDeviceKeyError.noKey,
    'key_invalidated': IrisDeviceKeyError.keyInvalidated,
    'cancelled': IrisDeviceKeyError.cancelled,
    'lockout': IrisDeviceKeyError.lockout,
    'interaction_not_allowed': IrisDeviceKeyError.interactionNotAllowed,
  };
}
