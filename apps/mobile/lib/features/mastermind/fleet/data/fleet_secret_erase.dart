import 'dart:convert';

import 'package:mobile/data/sources/supabase_client.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_crypto.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_pairing.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_pins.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Preference set before an erase on a secret platform and cleared only once
/// every owner key, pin and saved wrong-code count is gone.
const fleetSecretErasePendingKey = 'mastermind-secret-erase-pending';

/// Preference naming the sign-in session (the access token's `session_id`)
/// that this device's secret trust belongs to. Trust is admitted only for
/// that session: after any new sign-in, a reinstall, or when the record is
/// missing or unreadable, the old owner keys and pins are erased before a
/// secret page verifies anything. A refused or lost write at sign-out can
/// therefore never leave old trust usable after the next sign-in.
const fleetSecretTrustSessionKey = 'mastermind-secret-trust-session';

/// The current sign-in session id, or null when there is none to read.
String? Function() fleetSecretSessionId = _supabaseSessionId;

/// Sign-out or account switch: erases every owner key and pin on this
/// device and closes any open secret page. Every deletion is attempted even
/// after one is refused; if any is, the erase stays pending.
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
  await _serial(() async {
    final prefs = await _prefs();
    await _write(prefs, (p) => p.remove(fleetSecretTrustSessionKey));
    await _write(prefs, (p) => p.setBool(fleetSecretErasePendingKey, true));
    if (await _eraseEverything(secrets, pins)) {
      await _write(prefs, (p) => p.remove(fleetSecretErasePendingKey));
    }
  });
}

/// Admits secret entry for the current sign-in session, called before a
/// secret page verifies anything. True when this device's trust is recorded
/// for this session and no erase is pending. Otherwise it erases every owner
/// key, pin and saved count first and records the session; false (secret
/// entry stays blocked) when there is no session, a preference cannot be
/// read or written, or the erase is refused.
Future<bool> settleFleetSecretErase({
  FleetSecretCrypto? crypto,
  FleetSecretPins? pins,
}) {
  final secrets = crypto ?? FleetSecretCrypto.instance;
  if (!secrets.onSecretPlatform) return Future.value(true);
  return _serial(() async {
    final session = fleetSecretSessionId();
    if (session == null || session.isEmpty) return false;
    final prefs = await _prefs();
    if (prefs == null) return false;
    final bool pending;
    final String? bound;
    try {
      pending = prefs.getBool(fleetSecretErasePendingKey) ?? false;
      bound = prefs.getString(fleetSecretTrustSessionKey);
    } on Object {
      // A value of the wrong type is an unknown cleanup state.
      return false;
    }
    if (!pending && bound == session) return true;
    FleetPairingAttempts.shared.clear();
    if (!await _write(
      prefs,
      (p) => p.setBool(fleetSecretErasePendingKey, true),
    )) {
      return false;
    }
    if (!await _eraseEverything(secrets, pins)) return false;
    return await _write(
          prefs,
          (p) => p.setString(fleetSecretTrustSessionKey, session),
        ) &&
        await _write(prefs, (p) => p.remove(fleetSecretErasePendingKey));
  });
}

/// One erase or admission at a time, so a page never admits trust while a
/// sign-out erase is still running, and the two never interleave.
Future<void> _tail = Future<void>.value();

Future<T> _serial<T>(Future<T> Function() operation) {
  final future = _tail.then((_) => operation());
  _tail = future.then<void>((_) {}, onError: (Object _) {});
  return future;
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

Future<SharedPreferences?> _prefs() async {
  try {
    return await SharedPreferences.getInstance();
  } on Object {
    return null;
  }
}

/// A preference write that reports failure instead of throwing.
Future<bool> _write(
  SharedPreferences? prefs,
  Future<bool> Function(SharedPreferences prefs) write,
) async {
  if (prefs == null) return false;
  try {
    return await write(prefs);
  } on Object {
    return false;
  }
}

String? _supabaseSessionId() {
  final token = maybeSupabase?.auth.currentSession?.accessToken;
  if (token == null) return null;
  try {
    final parts = token.split('.');
    if (parts.length != 3) return null;
    final claims = jsonDecode(
      utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))),
    );
    final id = claims is Map<String, dynamic> ? claims['session_id'] : null;
    return id is String && id.isNotEmpty ? id : null;
  } on Object {
    return null;
  }
}
