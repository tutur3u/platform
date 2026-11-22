import 'dart:async';
import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_crypto.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_pairing.dart';

/// A pin starts [pending] when the owner types a correct pairing code and
/// turns [active] only once the machine's signed `paired` outcome names this
/// phone's key. Requests are answered against an active pin only.
enum FleetSecretPinState { pending, active }

/// One paired machine's Ed25519 key, as this phone trusts it.
@immutable
class FleetSecretPin {
  const FleetSecretPin({
    required this.machineId,
    required this.signerKey,
    required this.label,
    required this.pairedAt,
    required this.state,
    this.pairingId,
  });

  static FleetSecretPin? fromJson(String machineId, Object? json) {
    if (json is! Map<String, dynamic>) return null;
    final signerKey = json['signerKey'];
    final label = json['label'];
    final pairedAt = json['pairedAt'] is String
        ? DateTime.tryParse(json['pairedAt'] as String)?.toUtc()
        : null;
    final state = FleetSecretPinState.values
        .where((s) => s.name == json['state'])
        .firstOrNull;
    final pairingId = json['pairingId'];
    if (signerKey is! String ||
        label is! String ||
        pairedAt == null ||
        state == null) {
      return null;
    }
    return FleetSecretPin(
      machineId: machineId,
      signerKey: signerKey,
      label: label,
      pairedAt: pairedAt,
      state: state,
      pairingId: pairingId is String ? pairingId : null,
    );
  }

  final String machineId;

  /// Base64url, compared as text with a request's signed `signerKey`.
  final String signerKey;
  final String label;
  final DateTime pairedAt;
  final FleetSecretPinState state;

  /// The pairing a pending pin waits on.
  final String? pairingId;

  bool get active => state == FleetSecretPinState.active;

  FleetSecretPin activated() => FleetSecretPin(
    machineId: machineId,
    signerKey: signerKey,
    label: label,
    pairedAt: pairedAt,
    state: FleetSecretPinState.active,
  );

  Map<String, Object?> toJson() => {
    'signerKey': signerKey,
    'label': label,
    'pairedAt': pairedAt.toIso8601String(),
    'state': state.name,
    'pairingId': ?pairingId,
  };
}

/// Paired machines, per signed-in user, in the Keychain: this device only,
/// readable while unlocked. Signing out or switching accounts erases every
/// user's pins together with the owner keys ([eraseFleetSecretKeys]).
class FleetSecretPins {
  FleetSecretPins({
    required String? Function() userId,
    FlutterSecureStorage? storage,
  }) : _userId = userId,
       _storage = storage ?? fleetSecretStorage;

  static const keyPrefix = 'mastermind-secret-pins-v1.';

  final String? Function() _userId;
  final FlutterSecureStorage _storage;

  /// One queue for every instance, so [eraseAll] orders against writes made
  /// through any other instance.
  static Future<void> _tail = Future<void>.value();

  static Future<T> _serial<T>(Future<T> Function() operation) {
    final future = _tail.then((_) => operation());
    _tail = future.then<void>((_) {}, onError: (Object _) {});
    return future;
  }

  static String? _nameFor(String? user) => user == null || user.isEmpty
      ? null
      : '$keyPrefix${sha256.convert(utf8.encode(user))}';

  String? _name() => _nameFor(_userId());

  Future<Map<String, FleetSecretPin>> _read(String name) async {
    final raw = await _storage.read(key: name);
    if (raw == null) return {};
    try {
      final json = jsonDecode(raw);
      if (json is! Map<String, dynamic>) return {};
      return {
        for (final MapEntry(:key, :value) in json.entries)
          if (FleetSecretPin.fromJson(key, value) case final pin?) key: pin,
      };
    } on FormatException {
      return {};
    }
  }

  Future<void> _write(String name, Map<String, FleetSecretPin> pins) =>
      pins.isEmpty
      ? _storage.delete(key: name)
      : _storage.write(
          key: name,
          value: jsonEncode({
            for (final MapEntry(:key, :value) in pins.entries)
              key: value.toJson(),
          }),
        );

  /// The signed-in user's pins; empty while signed out.
  Future<Map<String, FleetSecretPin>> read() => _serial(() async {
    final name = _name();
    return name == null ? <String, FleetSecretPin>{} : await _read(name);
  });

  /// Changes the pins of [account] (default: the signed-in user). The
  /// account and the erasure count are fixed when this is called: the change
  /// is dropped when an erasure ran since, or another user signed in.
  Future<void> _update(
    void Function(Map<String, FleetSecretPin> pins) change, {
    String? account,
  }) {
    final erasure = fleetSecretErasures.value;
    final user = account ?? _userId();
    return _serial(() async {
      final name = _nameFor(user);
      if (name == null ||
          fleetSecretErasures.value != erasure ||
          _userId() != user) {
        return;
      }
      final pins = await _read(name);
      change(pins);
      await _write(name, pins);
    });
  }

  /// Records a pending pin after a correct pairing code. It replaces any
  /// earlier pin for the machine: a new pairing is the only way to change it.
  Future<void> putPending({
    required String machineId,
    required String signerKey,
    required String label,
    required String pairingId,
    required DateTime now,
    String? account,
  }) => _update(
    (pins) => pins[machineId] = FleetSecretPin(
      machineId: machineId,
      signerKey: signerKey,
      label: label,
      pairedAt: now.toUtc(),
      state: FleetSecretPinState.pending,
      pairingId: pairingId,
    ),
    account: account,
  );

  /// Activates the pending pin of [pairingId] when it still names
  /// [signerKey]. Returns the active pin, or null when nothing matched.
  Future<FleetSecretPin?> activate({
    required String machineId,
    required String pairingId,
    required String signerKey,
    String? account,
  }) async {
    FleetSecretPin? result;
    await _update(account: account, (pins) {
      final pin = pins[machineId];
      if (pin == null ||
          pin.state != FleetSecretPinState.pending ||
          pin.pairingId != pairingId ||
          pin.signerKey != signerKey) {
        return;
      }
      result = pins[machineId] = pin.activated();
    });
    return result;
  }

  /// "Forget this machine".
  Future<void> forget(String machineId, {String? account}) =>
      _update((pins) => pins.remove(machineId), account: account);

  /// Every user's pins on this device. The names are copied first, so the
  /// deletes never change a listing that is still being walked.
  Future<void> eraseAll() => _serial(() async {
    final names = (await _storage.readAll()).keys
        .where((name) => name.startsWith(keyPrefix))
        .toList();
    for (final name in names) {
      await _storage.delete(key: name);
    }
  });
}

/// The pins' Keychain items: this device only, readable only while unlocked,
/// never backed up, in an account of their own. Raw storage on purpose:
/// `deviceSecureStorage` keeps its items readable while the phone is locked
/// and refuses the listing that erasing every user's pins needs.
const fleetSecretStorage = FlutterSecureStorage(
  iOptions: IOSOptions(
    accessibility: KeychainAccessibility.unlocked_this_device,
    accountName: 'tuturuuu.mastermind-secret',
  ),
);

/// Bumped whenever the owner keys and pins are erased: an open secret page
/// clears its field and closes.
final fleetSecretErasures = ValueNotifier<int>(0);

/// Sign-out or account switch: erases every owner key and pin on this
/// device and closes any open secret page. Failures are swallowed so the
/// rest of the reset still runs; the next erase tries again.
Future<void> eraseFleetSecretKeys({
  FleetSecretCrypto? crypto,
  FleetSecretPins? pins,
}) async {
  fleetSecretErasures.value++;
  FleetPairingAttempts.shared.clear();
  final secrets = crypto ?? FleetSecretCrypto.instance;
  await Future.wait([
    secrets.deleteOwnerKeys().catchError((Object _) {}),
    _erasePins(secrets, pins).catchError((Object _) {}),
  ]);
}

/// Pins can exist only on a platform with secret entry, so elsewhere the
/// erase reads and lists nothing. The gate is the platform, never the
/// plugin's capability answer: a failed check must not keep pins.
Future<void> _erasePins(FleetSecretCrypto crypto, FleetSecretPins? pins) async {
  if (!crypto.onSecretPlatform) return;
  await (pins ?? FleetSecretPins(userId: () => null)).eraseAll();
}
