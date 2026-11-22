import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Whether the Inbox renders `secret` decisions as secret cards. Until it
/// does, the app never declares the `secret` fleet feature, so Web keeps
/// secret decisions away from cards that would offer the wrong answers.
const bool fleetSecretCardsReady = false;

/// Sealed answer parts, as raw bytes.
class FleetSecretSealed {
  const FleetSecretSealed({required this.enc, required this.ct});

  final Uint8List enc;
  final Uint8List ct;
}

/// Why a CryptoKit call failed, as a closed code; never key or message data.
class FleetSecretCryptoException implements Exception {
  const FleetSecretCryptoException(this.code);

  final String code;

  @override
  String toString() => 'FleetSecretCryptoException($code)';
}

/// The `mobile/mastermind_secret` channel: CryptoKit HPKE, Ed25519, HKDF,
/// HMAC and the Keychain owner key (`MastermindSecretPlugin.swift`).
///
/// Only iOS 17 or later implements it. Anywhere else, or when the plugin is
/// missing, [supported] is false and the app offers no secret entry. The
/// owner's private key never crosses the channel: Dart sends the bytes to
/// sign and gets the signature back.
class FleetSecretCrypto {
  FleetSecretCrypto({
    MethodChannel channel = const MethodChannel('mobile/mastermind_secret'),
    bool Function()? isIOS,
  }) : _channel = channel,
       _isIOS = isIOS ?? _platformIsIOS;

  /// The app's instance; tests build their own over a mocked channel.
  static FleetSecretCrypto instance = FleetSecretCrypto();

  static bool _platformIsIOS() =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.iOS;

  final MethodChannel _channel;
  final bool Function() _isIOS;
  Future<bool>? _supported;

  /// iOS 17 or later with the plugin present; asked once per instance.
  Future<bool> supported() => _supported ??= _askSupported();

  Future<bool> _askSupported() async {
    if (!_isIOS()) return false;
    try {
      return await _channel.invokeMethod<bool>('supported') ?? false;
    } on MissingPluginException {
      return false;
    } on PlatformException {
      return false;
    }
  }

  Future<T> _call<T>(String method, Map<String, Object?> args) async {
    if (!await supported()) {
      throw const FleetSecretCryptoException('unsupported');
    }
    try {
      final value = await _channel.invokeMethod<T>(method, args);
      if (value == null) throw const FleetSecretCryptoException('failed');
      return value;
    } on MissingPluginException {
      throw const FleetSecretCryptoException('unsupported');
    } on PlatformException catch (error) {
      throw FleetSecretCryptoException(_code(error.code));
    }
  }

  static String _code(String code) =>
      RegExp(r'^[a-z][a-z_]{0,40}$').hasMatch(code) ? code : 'failed';

  static Uint8List _bytes(Object? value, int length) {
    if (value is Uint8List && value.length == length) return value;
    throw const FleetSecretCryptoException('failed');
  }

  /// HPKE base mode seal to the helper's one-use key. The plugin wipes its
  /// own copy of [plaintext]; the caller zeroes this one.
  Future<FleetSecretSealed> seal({
    required Uint8List publicKey,
    required Uint8List aad,
    required Uint8List plaintext,
  }) async {
    final reply = await _call<Map<Object?, Object?>>('seal', {
      'publicKey': publicKey,
      'aad': aad,
      'plaintext': plaintext,
    });
    final enc = _bytes(reply['enc'], 32);
    final ct = reply['ct'];
    if (ct is! Uint8List || ct.length < 16 + 256) {
      throw const FleetSecretCryptoException('failed');
    }
    return FleetSecretSealed(enc: enc, ct: ct);
  }

  /// This account's raw Ed25519 owner key, made on first use.
  Future<Uint8List> ownerPublicKey(String accountId) async => _bytes(
    await _call<Uint8List>('ownerPublicKey', {'accountId': accountId}),
    32,
  );

  /// The owner key's Ed25519 signature over [message].
  Future<Uint8List> ownerSign(String accountId, Uint8List message) async =>
      _bytes(
        await _call<Uint8List>('ownerSign', {
          'accountId': accountId,
          'message': message,
        }),
        64,
      );

  /// Removes one account's owner key, or every one without [accountId].
  /// Quietly does nothing where the plugin is not offered.
  Future<void> deleteOwnerKeys({String? accountId}) async {
    if (!await supported()) return;
    try {
      await _channel.invokeMethod<void>('deleteOwnerKeys', {
        'accountId': ?accountId,
      });
    } on MissingPluginException {
      return;
    } on PlatformException catch (error) {
      throw FleetSecretCryptoException(_code(error.code));
    }
  }

  Future<bool> verifyEd25519({
    required Uint8List publicKey,
    required Uint8List message,
    required Uint8List signature,
  }) async {
    try {
      return await _call<bool>('verifyEd25519', {
        'publicKey': publicKey,
        'message': message,
        'signature': signature,
      });
    } on FleetSecretCryptoException catch (error) {
      if (error.code == 'unsupported') rethrow;
      return false;
    }
  }

  /// HKDF-SHA256 of the 10 code bytes, salted with [pairingId].
  Future<Uint8List> pairingKey({
    required Uint8List code,
    required String pairingId,
  }) async => _bytes(
    await _call<Uint8List>('pairingKey', {
      'code': code,
      'pairingId': pairingId,
    }),
    32,
  );

  Future<Uint8List> hmac({
    required Uint8List key,
    required Uint8List message,
  }) async => _bytes(
    await _call<Uint8List>('hmac', {'key': key, 'message': message}),
    32,
  );

  /// Constant-time MAC comparison.
  Future<bool> macEqual(Uint8List a, Uint8List b) =>
      _call<bool>('macEqual', {'a': a, 'b': b});
}
