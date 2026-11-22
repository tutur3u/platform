import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_binding.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_crypto.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_pins.dart';

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

/// The result of one typed code. [unavailable]: the saved wrong-code count
/// could not be read or saved, so the card takes no code.
enum FleetPairingCheck { ok, malformed, wrong, locked, unavailable }

/// Wrong pairing codes per pairing challenge. Five lock the card. With a
/// storage the counts persist in the secret Keychain account, so restarting
/// the app does not reset them. A count is keyed by the hash of the whole
/// signed challenge (id, machine, label, key and expiry), so a substituted
/// card with the same id cannot change the genuine card's count or expiry;
/// it is dropped at that expiry, kept at most [maxRetention], and erasing
/// the secret keys forgets every count.
class FleetPairingAttempts {
  FleetPairingAttempts({FlutterSecureStorage? storage}) : _storage = storage;

  static const maxWrong = 5;
  static const maxRetention = Duration(hours: 24);

  /// The Keychain item holding every challenge's count and expiry.
  static const storageKey = 'mastermind-secret-pairing-attempts-v1';

  static final shared = FleetPairingAttempts(storage: fleetSecretStorage);

  static String challengeOf(FleetSecretPairing pairing) =>
      FleetSecretBinding.sha256Hex(FleetSecretBinding.pairMachine(pairing));

  final FlutterSecureStorage? _storage;
  final _wrong = <String, int>{};
  final _expires = <String, DateTime>{};
  bool _loaded = false;
  Future<void> _tail = Future<void>.value();

  /// Bumped by [clear]: a check that started earlier records nothing.
  int _generation = 0;

  /// Reads the saved counts, once per run after a successful read. Returns
  /// false when the Keychain item exists but cannot be read; the caller
  /// must then take no code. A later call reads again.
  Future<bool> load({required DateTime now}) {
    final generation = _generation;
    return _serial(() => _load(now, generation));
  }

  int wrong(FleetSecretPairing pairing) => _wrong[challengeOf(pairing)] ?? 0;
  bool locked(FleetSecretPairing pairing) => wrong(pairing) >= maxWrong;
  int remaining(FleetSecretPairing pairing) => maxWrong - wrong(pairing);

  /// Forgets every count in memory and fences checks already running. The
  /// Keychain item is deleted with the pins ([FleetSecretPins.eraseAll]),
  /// so platforms without secret entry never touch secure storage.
  void clear() {
    _generation++;
    _wrong.clear();
    _expires.clear();
  }

  /// Deletes the saved counts in this instance's queue, after every load
  /// and save queued before it. Called by the erase on secret platforms.
  Future<void> eraseSaved() => _serial(() async {
    final storage = _storage;
    if (storage != null) await storage.delete(key: storageKey);
  });

  /// Loads under [generation], captured when the caller queued: after a
  /// [clear] the queued work loads and records nothing, and a read that
  /// [clear] overtook never repopulates the counts.
  Future<bool> _load(DateTime now, int generation) async {
    if (generation != _generation) return false;
    if (!_loaded) {
      final storage = _storage;
      if (storage != null) {
        final saved = await _readSaved(storage);
        if (saved == null || generation != _generation) return false;
        for (final MapEntry(:key, :value) in saved.entries) {
          final (count, expires) = value;
          if (count > (_wrong[key] ?? 0)) _wrong[key] = count;
          _expires[key] = expires;
        }
      }
      _loaded = true;
    }
    _prune(now);
    return true;
  }

  /// Counts one wrong code for [challenge] and saves every count. Returns
  /// false when the save failed; a check fenced by [clear] saves nothing.
  Future<bool> _recordWrong(
    String challenge, {
    required DateTime expiresAt,
    required DateTime now,
    required int generation,
  }) async {
    if (generation != _generation) return true;
    _wrong[challenge] = (_wrong[challenge] ?? 0) + 1;
    final cap = now.toUtc().add(maxRetention);
    _expires[challenge] = expiresAt.toUtc().isBefore(cap)
        ? expiresAt.toUtc()
        : cap;
    _prune(now);
    final storage = _storage;
    if (storage == null) return true;
    try {
      await storage.write(
        key: storageKey,
        value: jsonEncode({
          for (final MapEntry(:key, :value) in _wrong.entries)
            key: {
              'wrong': value,
              'expiresAt': _expires[key]!.toIso8601String(),
            },
        }),
      );
      return true;
    } on Object {
      return false;
    }
  }

  void _prune(DateTime now) {
    final expired = _expires.entries
        .where((entry) => !now.toUtc().isBefore(entry.value))
        .map((entry) => entry.key)
        .toList();
    for (final id in expired) {
      _wrong.remove(id);
      _expires.remove(id);
    }
  }

  Future<T> _serial<T>(Future<T> Function() operation) {
    final future = _tail.then((_) => operation());
    _tail = future.then<void>((_) {}, onError: (Object _) {});
    return future;
  }

  /// The saved counts: empty when there is no item, null when it cannot be
  /// read. Malformed entries are skipped.
  static Future<Map<String, (int, DateTime)>?> _readSaved(
    FlutterSecureStorage storage,
  ) async {
    final String? raw;
    try {
      raw = await storage.read(key: storageKey);
    } on Object {
      return null;
    }
    if (raw == null) return {};
    final Object? json;
    try {
      json = jsonDecode(raw);
    } on FormatException {
      return null;
    }
    if (json is! Map<String, dynamic>) return null;
    return {
      for (final MapEntry(:key, :value) in json.entries)
        if (value case {
          'wrong': final int count,
          'expiresAt': final String expires,
        })
          if (DateTime.tryParse(expires)?.toUtc() case final at?)
            key: (count, at),
    };
  }
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
  /// does not count against the card; a wrong one does. Checks run one at a
  /// time, so two screens cannot both pass the lock before either counts its
  /// fifth wrong code, and an erase during a check fences its count.
  Future<(FleetPairingCheck, Uint8List?)> check(
    FleetSecretPairing pairing,
    String code, {
    required DateTime now,
  }) {
    // Captured before queueing, so a check queued before an erase or
    // account switch runs under the old generation and records nothing.
    final generation = _attempts._generation;
    return _attempts._serial(() => _check(pairing, code, now, generation));
  }

  Future<(FleetPairingCheck, Uint8List?)> _check(
    FleetSecretPairing pairing,
    String code,
    DateTime now,
    int generation,
  ) async {
    if (!await _attempts._load(now, generation)) {
      return (FleetPairingCheck.unavailable, null);
    }
    if (_attempts.locked(pairing)) return (FleetPairingCheck.locked, null);
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
    final saved = await _attempts._recordWrong(
      FleetPairingAttempts.challengeOf(pairing),
      expiresAt: pairing.expiresAtTime,
      now: now,
      generation: generation,
    );
    if (!saved) return (FleetPairingCheck.unavailable, null);
    return (
      _attempts.locked(pairing)
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
