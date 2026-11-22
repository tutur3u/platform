import 'package:mobile/features/mastermind/fleet/data/fleet_secret_crypto.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_pairing.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_pins.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Preference set before an erase on a secret platform and cleared only once
/// every owner key, pin and saved wrong-code count is gone. While it is set,
/// secret entry stays blocked and every new secret page tries the erase
/// again, so a Keychain that refused a deletion at sign-out never leaves the
/// old trust usable after the next sign-in.
const fleetSecretErasePendingKey = 'mastermind-secret-erase-pending';

/// Sign-out or account switch: erases every owner key and pin on this
/// device and closes any open secret page. Every deletion is attempted even
/// after one is refused; if any is, the erase stays pending
/// ([settleFleetSecretErase]).
Future<void> eraseFleetSecretKeys({
  FleetSecretCrypto? crypto,
  FleetSecretPins? pins,
}) async {
  fleetSecretErasures.value++;
  FleetPairingAttempts.shared.clear();
  final secrets = crypto ?? FleetSecretCrypto.instance;
  if (!secrets.onSecretPlatform) {
    // Pins and saved counts exist only on a secret platform, so elsewhere
    // the erase reads and lists nothing.
    await secrets.deleteOwnerKeys().catchError((Object _) {});
    return;
  }
  await _setPending(true);
  if (await _eraseEverything(secrets, pins)) await _setPending(false);
}

/// Called before a secret page verifies anything. True when no erase is
/// pending, or when the pending one now completes; false keeps secret entry
/// blocked (including when the marker cannot be read).
Future<bool> settleFleetSecretErase({
  FleetSecretCrypto? crypto,
  FleetSecretPins? pins,
}) async {
  final secrets = crypto ?? FleetSecretCrypto.instance;
  if (!secrets.onSecretPlatform) return true;
  final bool pending;
  try {
    final prefs = await SharedPreferences.getInstance();
    pending = prefs.getBool(fleetSecretErasePendingKey) ?? false;
  } on Object {
    return false;
  }
  if (!pending) return true;
  FleetPairingAttempts.shared.clear();
  if (!await _eraseEverything(secrets, pins)) return false;
  return await _setPending(false);
}

Future<bool> _eraseEverything(
  FleetSecretCrypto crypto,
  FleetSecretPins? pins,
) async {
  final done = await Future.wait([
    _succeeds(crypto.deleteOwnerKeys),
    _succeeds((pins ?? FleetSecretPins(userId: () => null)).eraseAll),
    _succeeds(FleetPairingAttempts.shared.eraseSaved),
  ]);
  return done.every((ok) => ok);
}

Future<bool> _succeeds(Future<void> Function() operation) async {
  try {
    await operation();
    return true;
  } on Object {
    return false;
  }
}

Future<bool> _setPending(bool pending) async {
  try {
    final prefs = await SharedPreferences.getInstance();
    return pending
        ? await prefs.setBool(fleetSecretErasePendingKey, true)
        : await prefs.remove(fleetSecretErasePendingKey);
  } on Object {
    return false;
  }
}
