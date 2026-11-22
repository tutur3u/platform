import 'dart:typed_data';

import 'package:mobile/features/mastermind/fleet/data/fleet_secret.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_binding.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_crypto.dart';

/// Crockford base32: no I, L, O or U.
const _alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const _aliases = {'I': '1', 'L': '1', 'O': '0'};
final _separators = RegExp(r'[\s-]');

/// The pairing code's 10 bytes, or null. Accepts lower case, spaces, dashes
/// and the Crockford look-alikes (I and L read as 1, O as 0), exactly like
/// `parsePairingCode` in `scripts/mastermind-fleet/secret-pairing.mjs`.
Uint8List? parseFleetPairingCode(String text) {
  final chars = text
      .toUpperCase()
      .replaceAll(_separators, '')
      .split('')
      .map((c) => _aliases[c] ?? c)
      .join();
  if (chars.length != 16) return null;
  final out = Uint8List(10);
  var length = 0;
  var bits = 0;
  var value = 0;
  for (final char in chars.split('')) {
    final index = _alphabet.indexOf(char);
    if (index < 0) return null;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out[length++] = (value >> (bits - 8)) & 0xff;
      bits -= 8;
      value &= (1 << bits) - 1;
    }
  }
  return out;
}

/// The result of one typed code.
enum FleetPairingCheck { ok, malformed, wrong, locked }

/// Wrong pairing codes per pairing, for this app run. Five lock the card;
/// erasing the secret keys forgets the counts.
class FleetPairingAttempts {
  static const maxWrong = 5;
  static final shared = FleetPairingAttempts();

  final _wrong = <String, int>{};

  int wrong(String pairingId) => _wrong[pairingId] ?? 0;
  bool locked(String pairingId) => wrong(pairingId) >= maxWrong;
  int remaining(String pairingId) => maxWrong - wrong(pairingId);
  void recordWrong(String pairingId) =>
      _wrong[pairingId] = wrong(pairingId) + 1;
  void clear() => _wrong.clear();
}

/// Checks a typed code against the machine's MAC and, when it matches,
/// returns the owner's answer for the same pairing.
class FleetSecretPairer {
  FleetSecretPairer({
    required FleetSecretCrypto crypto,
    FleetPairingAttempts? attempts,
  }) : _crypto = crypto,
       _attempts = attempts ?? FleetPairingAttempts.shared;

  final FleetSecretCrypto _crypto;
  final FleetPairingAttempts _attempts;

  /// The derived pairing key when [code] proves the machine knows the same
  /// code ([FleetPairingCheck.ok]); otherwise null and why. A malformed code
  /// does not count against the card; a wrong one does.
  Future<(FleetPairingCheck, Uint8List?)> check(
    FleetSecretPairing pairing,
    String code,
  ) async {
    if (_attempts.locked(pairing.pairingId)) {
      return (FleetPairingCheck.locked, null);
    }
    final bytes = parseFleetPairingCode(code);
    if (bytes == null) return (FleetPairingCheck.malformed, null);
    Uint8List? key;
    try {
      key = await _crypto.pairingKey(code: bytes, pairingId: pairing.pairingId);
      final mac = await _crypto.hmac(
        key: key,
        message: FleetSecretBinding.pairMachine(pairing),
      );
      final expected = Uint8List.fromList(
        fleetSecretFromB64url(pairing.machineMac, length: 32)!,
      );
      if (await _crypto.macEqual(mac, expected)) {
        return (FleetPairingCheck.ok, key);
      }
    } finally {
      FleetSecretBinding.wipe(bytes);
    }
    FleetSecretBinding.wipe(key);
    _attempts.recordWrong(pairing.pairingId);
    return (
      _attempts.locked(pairing.pairingId)
          ? FleetPairingCheck.locked
          : FleetPairingCheck.wrong,
      null,
    );
  }

  /// `HMAC(k, B(pair-owner))` for [ownerKey] (base64url). Wipes [key].
  Future<String> ownerMac(
    FleetSecretPairing pairing,
    Uint8List key,
    String ownerKey,
  ) async {
    try {
      return fleetSecretB64url(
        await _crypto.hmac(
          key: key,
          message: FleetSecretBinding.pairOwner(pairing, ownerKey),
        ),
      );
    } finally {
      FleetSecretBinding.wipe(key);
    }
  }
}
