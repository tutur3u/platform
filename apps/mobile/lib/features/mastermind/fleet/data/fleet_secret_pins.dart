import 'dart:async';
import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_crypto.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_pairing.dart';

/// A pin starts [pending] when the owner types a correct pairing code and
/// turns [active] only once the machine's signed `paired` outcome names this
/// phone's key. Requests are answered against an active pin only.
enum FleetSecretPinState { pending, active }

/// A re-pairing of a machine that already has an active pin. The active key
/// stays in use until the machine's signed `paired` outcome confirms this
/// pairing before [expiresAt]; only then does it replace the active key.
@immutable
class FleetSecretPinCandidate {
  const FleetSecretPinCandidate({
    required this.signerKey,
    required this.label,
    required this.pairingId,
    required this.pairedAt,
    required this.expiresAt,
  });

  static FleetSecretPinCandidate? fromJson(Object? json) {
    if (json is! Map<String, dynamic>) return null;
    final signerKey = json['signerKey'];
    final label = json['label'];
    final pairingId = json['pairingId'];
    final pairedAt = _time(json['pairedAt']);
    final expiresAt = _time(json['expiresAt']);
    if (!_isKey(signerKey) ||
        label is! String ||
        pairingId is! String ||
        pairedAt == null ||
        expiresAt == null) {
      return null;
    }
    return FleetSecretPinCandidate(
      signerKey: signerKey! as String,
      label: label,
      pairingId: pairingId,
      pairedAt: pairedAt,
      expiresAt: expiresAt,
    );
  }

  final String signerKey;
  final String label;
  final String pairingId;
  final DateTime pairedAt;
  final DateTime expiresAt;

  bool liveAt(DateTime now) => now.toUtc().isBefore(expiresAt);

  Map<String, Object?> toJson() => {
    'signerKey': signerKey,
    'label': label,
    'pairingId': pairingId,
    'pairedAt': pairedAt.toIso8601String(),
    'expiresAt': expiresAt.toIso8601String(),
  };
}

DateTime? _time(Object? value) =>
    value is String ? DateTime.tryParse(value)?.toUtc() : null;

bool _isKey(Object? value) =>
    value is String && fleetSecretFromB64url(value, length: 32) != null;

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
    this.expiresAt,
    this.candidate,
  });

  static FleetSecretPin? fromJson(String machineId, Object? json) {
    if (json is! Map<String, dynamic>) return null;
    final signerKey = json['signerKey'];
    final label = json['label'];
    final pairedAt = _time(json['pairedAt']);
    final state = FleetSecretPinState.values
        .where((s) => s.name == json['state'])
        .firstOrNull;
    final pairingId = json['pairingId'];
    if (!_isKey(signerKey) ||
        label is! String ||
        pairedAt == null ||
        state == null) {
      return null;
    }
    return FleetSecretPin(
      machineId: machineId,
      signerKey: signerKey! as String,
      label: label,
      pairedAt: pairedAt,
      state: state,
      pairingId: pairingId is String ? pairingId : null,
      expiresAt: _time(json['expiresAt']),
      // Only an active pin can carry a re-pairing.
      candidate: state == FleetSecretPinState.active
          ? FleetSecretPinCandidate.fromJson(json['candidate'])
          : null,
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

  /// When a pending pin's pairing ends. A pending pin without one (written
  /// before expiry was stored) never activates: it needs a fresh pairing.
  final DateTime? expiresAt;

  /// A re-pairing waiting for the machine's confirmation; active pins only.
  final FleetSecretPinCandidate? candidate;

  bool get active => state == FleetSecretPinState.active;

  /// The pairing this pin waits on and the key it would trust: a pending
  /// pin's own, or an active pin's live candidate.
  (String pairingId, String signerKey)? awaiting(DateTime now) {
    if (!active) {
      final id = pairingId;
      final end = expiresAt;
      return id == null || end == null || !now.toUtc().isBefore(end)
          ? null
          : (id, signerKey);
    }
    final next = candidate;
    return next != null && next.liveAt(now)
        ? (next.pairingId, next.signerKey)
        : null;
  }

  FleetSecretPin activated() => FleetSecretPin(
    machineId: machineId,
    signerKey: signerKey,
    label: label,
    pairedAt: pairedAt,
    state: FleetSecretPinState.active,
  );

  FleetSecretPin withCandidate(FleetSecretPinCandidate? next) => FleetSecretPin(
    machineId: machineId,
    signerKey: signerKey,
    label: label,
    pairedAt: pairedAt,
    state: state,
    pairingId: pairingId,
    expiresAt: expiresAt,
    candidate: next,
  );

  Map<String, Object?> toJson() => {
    'signerKey': signerKey,
    'label': label,
    'pairedAt': pairedAt.toIso8601String(),
    'state': state.name,
    'pairingId': ?pairingId,
    'expiresAt': ?expiresAt?.toIso8601String(),
    'candidate': ?candidate?.toJson(),
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

  /// In-memory twin of the stored revision. Forget advances it the moment it
  /// is asked for, before its Keychain write queues, so a dispatch guard
  /// whose pin read was already waiting refuses at once. A stage or
  /// activation advances it only when it commits, so a duplicate or refused
  /// one never stops a valid open request.
  static final _epochs = <String, int>{};

  static String _epochKey(String? user, String machineId) =>
      '${_nameFor(user)}|$machineId';

  /// [machineId]'s in-memory epoch for [account] (default: signed-in user).
  int epoch(String machineId, {String? account}) =>
      _epochs[_epochKey(account ?? _userId(), machineId)] ?? 0;

  void _advance(String machineId, String? account) {
    final key = _epochKey(account ?? _userId(), machineId);
    _epochs[key] = (_epochs[key] ?? 0) + 1;
  }

  /// Trust changes asked for so far, counted the moment each one queues.
  /// A guard whose pin read saw this move reads again behind them.
  static final _queued = <String, int>{};

  /// [machineId]'s count of queued trust changes for [account].
  int queued(String machineId, {String? account}) =>
      _queued[_epochKey(account ?? _userId(), machineId)] ?? 0;

  void _enqueue(String machineId, String? account) {
    final key = _epochKey(account ?? _userId(), machineId);
    _queued[key] = (_queued[key] ?? 0) + 1;
  }

  /// Reserved entry beside the pins: pairings that already activated, kept
  /// until they expire so the same pairing can never be staged again, even
  /// after "Forget this machine". Machine ids cannot start with `~`.
  static const _usedKey = '~usedPairings';

  /// Reserved entry: a revision per machine that every change to that
  /// machine's trust advances, Forget included even with no pin left, so a
  /// screen that waited can tell that anything changed meanwhile.
  static const _revisionsKey = '~revisions';

  Future<_PinStore> _read(String name) async {
    final raw = await _storage.read(key: name);
    if (raw == null) return _PinStore({}, {}, {});
    try {
      final json = jsonDecode(raw);
      if (json is! Map<String, dynamic>) return _PinStore({}, {}, {});
      final used = json[_usedKey];
      final revisions = json[_revisionsKey];
      return _PinStore(
        {
          for (final MapEntry(:key, :value) in json.entries)
            if (key != _usedKey && key != _revisionsKey)
              if (FleetSecretPin.fromJson(key, value) case final pin?) key: pin,
        },
        {
          if (used is Map<String, dynamic>)
            for (final MapEntry(:key, :value) in used.entries)
              if (_time(value) case final end?) key: end,
        },
        {
          if (revisions is Map<String, dynamic>)
            for (final MapEntry(:key, :value) in revisions.entries)
              if (value is int) key: value,
        },
      );
    } on FormatException {
      return _PinStore({}, {}, {});
    }
  }

  static String? _encode(_PinStore store) =>
      store.pins.isEmpty && store.used.isEmpty && store.revisions.isEmpty
      ? null
      : jsonEncode({
          for (final MapEntry(:key, :value) in store.pins.entries)
            key: value.toJson(),
          if (store.used.isNotEmpty)
            _usedKey: {
              for (final MapEntry(:key, :value) in store.used.entries)
                key: value.toIso8601String(),
            },
          if (store.revisions.isNotEmpty) _revisionsKey: store.revisions,
        });

  /// The signed-in user's pins; empty while signed out.
  Future<Map<String, FleetSecretPin>> read() => _serial(() async {
    final name = _name();
    return name == null ? <String, FleetSecretPin>{} : (await _read(name)).pins;
  });

  /// [machineId]'s pin and trust revision for the signed-in user. Compare
  /// the revision after a wait: any change to the machine's trust since,
  /// Forget included, gives a different one.
  Future<FleetSecretTrust> trust(String machineId) => _serial(() async {
    final name = _name();
    if (name == null) return (pin: null, revision: -1);
    final store = await _read(name);
    return (pin: store.pins[machineId], revision: store.revision(machineId));
  });

  /// Changes the pins of [account] (default: the signed-in user). The
  /// account and the erasure count are fixed when this is called: the change
  /// is dropped when an erasure ran since, or another user signed in.
  ///
  /// [committed] runs only after the Keychain write succeeded, before
  /// listeners hear of the change.
  Future<void> _update(
    void Function(_PinStore store) change, {
    String? account,
    void Function()? committed,
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
      final store = await _read(name);
      final before = _encode(store);
      change(store);
      final after = _encode(store);
      // A refused or no-op change writes nothing, so the Keychain item is
      // only ever rewritten for a real change.
      if (after == before) return;
      await (after == null
          ? _storage.delete(key: name)
          : _storage.write(key: name, value: after));
      committed?.call();
      fleetSecretPinChanges.value++;
    });
  }

  /// Records a correct pairing code. With no active pin for the machine it
  /// stores a pending pin, replacing any earlier pending one. An active pin
  /// stays in use and keeps this pairing as its candidate until the machine
  /// confirms it before [expiresAt]; a newer pairing replaces the candidate.
  /// Returns the machine's new trust revision, or null, storing nothing,
  /// for a pairing that already activated, when the machine's revision is no
  /// longer [expectedRevision] (taken before the code check), when
  /// [stillWanted] answers false inside the queue, or when the write was
  /// dropped (an erasure or account switch since).
  Future<int?> putPending({
    required String machineId,
    required String signerKey,
    required String label,
    required String pairingId,
    required DateTime now,
    required DateTime expiresAt,
    int? expectedRevision,
    bool Function()? stillWanted,
    String? account,
  }) async {
    _enqueue(machineId, account);
    int? stored;
    await _update(
      (store) {
        // Asked again inside the queue, after the read: a page that left
        // while this waited stages nothing.
        if (stillWanted != null && !stillWanted()) return;
        store.prune(now);
        if (store.used.containsKey(pairingId)) return;
        if (expectedRevision != null &&
            store.revision(machineId) != expectedRevision) {
          return;
        }
        stored = store.bump(machineId);
        final pins = store.pins;
        final current = pins[machineId];
        if (current != null && current.active) {
          pins[machineId] = current.withCandidate(
            FleetSecretPinCandidate(
              signerKey: signerKey,
              label: label,
              pairingId: pairingId,
              pairedAt: now.toUtc(),
              expiresAt: expiresAt.toUtc(),
            ),
          );
          return;
        }
        pins[machineId] = FleetSecretPin(
          machineId: machineId,
          signerKey: signerKey,
          label: label,
          pairedAt: now.toUtc(),
          state: FleetSecretPinState.pending,
          pairingId: pairingId,
          expiresAt: expiresAt.toUtc(),
        );
      },
      account: account,
      committed: () {
        if (stored != null) _advance(machineId, account);
      },
    );
    return stored;
  }

  /// Activates the pairing [pairingId] when it still names [signerKey]: a
  /// pending pin turns active, or an active pin's live candidate replaces
  /// its key in the same write. Expiry is checked against [clock] inside the
  /// serialized write, so a confirmation queued behind another Keychain
  /// operation cannot activate after the pairing ends. Returns the active
  /// pin, or null when nothing matched or the pairing expired.
  Future<FleetSecretPin?> activate({
    required String machineId,
    required String pairingId,
    required String signerKey,
    required DateTime Function() clock,
    String? account,
  }) async {
    _enqueue(machineId, account);
    FleetSecretPin? result;
    await _update(
      account: account,
      (store) {
        final now = clock();
        store.prune(now);
        final pin = store.pins[machineId];
        final awaited = pin?.awaiting(now);
        if (pin == null ||
            awaited == null ||
            awaited.$1 != pairingId ||
            awaited.$2 != signerKey ||
            store.used.containsKey(pairingId)) {
          return;
        }
        final next = pin.candidate;
        store.used[pairingId] = pin.active && next != null
            ? next.expiresAt
            : pin.expiresAt!;
        store.bump(machineId);
        result = store.pins[machineId] = pin.active && next != null
            ? FleetSecretPin(
                machineId: machineId,
                signerKey: next.signerKey,
                label: next.label,
                pairedAt: next.pairedAt,
                state: FleetSecretPinState.active,
              )
            : pin.activated();
      },
      committed: () {
        if (result != null) _advance(machineId, account);
      },
    );
    return result;
  }

  /// "Forget this machine".
  Future<void> forget(String machineId, {String? account}) {
    _enqueue(machineId, account);
    _advance(machineId, account);
    return _update((store) {
      store.pins.remove(machineId);
      store.bump(machineId);
    }, account: account);
  }

  /// Every user's pins on this device. The names are copied first, so the
  /// deletes never change a listing that is still being walked. The saved
  /// wrong-code counts are deleted by their own queue
  /// ([FleetPairingAttempts.eraseSaved]).
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

/// Bumped after every pins write, so open secret pages refresh what they
/// offer (Forget) from the stored trust.
final fleetSecretPinChanges = ValueNotifier<int>(0);

/// A machine's stored pin, if any, and its trust revision (-1 signed out).
typedef FleetSecretTrust = ({FleetSecretPin? pin, int revision});

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
  await Future.wait([
    (pins ?? FleetSecretPins(userId: () => null)).eraseAll(),
    FleetPairingAttempts.shared.eraseSaved(),
  ]);
}

/// One user's Keychain entry: the pins, the pairings already used and each
/// machine's trust revision.
class _PinStore {
  _PinStore(this.pins, this.used, this.revisions);

  final Map<String, FleetSecretPin> pins;
  final Map<String, DateTime> used;
  final Map<String, int> revisions;

  int revision(String machineId) => revisions[machineId] ?? 0;

  int bump(String machineId) => revisions[machineId] = revision(machineId) + 1;

  void prune(DateTime now) =>
      used.removeWhere((_, end) => !now.toUtc().isBefore(end));
}
