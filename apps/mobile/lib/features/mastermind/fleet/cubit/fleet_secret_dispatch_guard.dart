import 'package:mobile/features/mastermind/fleet/data/fleet_secret.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_pins.dart';

/// Whether an open secret screen may still dispatch its answer.
///
/// The flow records the machine's trust when it verifies a request or
/// stages a pairing: the stored revision and the in-memory epoch
/// ([FleetSecretPins.epoch]). A dispatch is allowed only while the screen is
/// current (open, not erased, same account) and neither moved. Both are
/// checked before and after the pin read, which can wait in the pins queue,
/// so a Forget tapped during that wait refuses the dispatch at once. A read
/// that fails refuses too.
class FleetSecretDispatchGuard {
  FleetSecretDispatchGuard({
    required FleetSecretPins pins,
    required FleetSecret secret,
    required bool Function() current,
    required DateTime Function() now,
  }) : _pins = pins,
       _secret = secret,
       _current = current,
       _now = now;

  final FleetSecretPins _pins;
  final FleetSecret _secret;
  final bool Function() _current;
  final DateTime Function() _now;

  int? _revision;
  int? _epoch;

  /// The machine's in-memory epoch now. Read it synchronously before the
  /// pin read or write whose revision [capture] then records.
  int epoch(String? account) =>
      _pins.epoch(_secret.machineId, account: account);

  void capture({required int? revision, required int epoch}) {
    _revision = revision;
    _epoch = epoch;
  }

  /// A stage, activation or Forget queued while the pin read waited sends
  /// the guard to read again behind it: a committed change then shows as a
  /// new revision and refuses, a duplicate leaves it and allows. Gives up,
  /// refusing, if changes keep arriving.
  Future<bool> allows(String? account) async {
    final revision = _revision;
    final epoch = _epoch;
    if (revision == null || epoch == null) return false;
    for (var attempt = 0; attempt < 3; attempt++) {
      if (!_unchanged(epoch, account)) return false;
      final queued = _pins.queued(_secret.machineId, account: account);
      final FleetSecretTrust trust;
      try {
        trust = await _pins.trust(_secret.machineId);
      } on Object {
        return false;
      }
      if (!_unchanged(epoch, account) || trust.revision != revision) {
        return false;
      }
      if (_pins.queued(_secret.machineId, account: account) != queued) {
        continue;
      }
      final pin = trust.pin;
      if (pin == null) return false;
      return switch (_secret) {
        final FleetSecretRequest request =>
          pin.active && pin.signerKey == request.signerKey,
        final FleetSecretPairing pairing =>
          pin.awaiting(_now()) == (pairing.pairingId, pairing.signerKey),
      };
    }
    return false;
  }

  bool _unchanged(int epoch, String? account) =>
      _current() && this.epoch(account) == epoch;
}
