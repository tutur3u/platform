import 'dart:typed_data';

import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_binding.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_crypto.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_pins.dart';

/// Activates pending pins and re-pairings whose pairing the machine settled
/// for this phone's key ([keyId]) in [snapshot]'s resolved list, each only
/// on that machine's valid signature over the `paired` outcome. Stops when
/// [ended] answers true.
Future<void> activateConfirmedPins({
  required FleetSnapshot snapshot,
  required FleetSecretPins pins,
  required FleetSecretCrypto crypto,
  required String? keyId,
  required String? account,
  required DateTime Function() now,
  required bool Function() ended,
}) async {
  for (final pin in (await pins.read()).values) {
    final awaited = pin.awaiting(now());
    if (awaited == null) continue;
    final (pairingId, signerKey) = awaited;
    final outcome = snapshot.resolved
        .where((r) => r.id == pairingId)
        .firstOrNull
        ?.secretOutcome;
    if (outcome == null ||
        outcome.outcome != FleetSecretOutcomeKind.paired ||
        outcome.answerDigest != keyId) {
      continue;
    }
    final verified = await crypto.verifyEd25519(
      publicKey: _bytes(signerKey, 32),
      message: FleetSecretBinding.outcome(
        pairingId,
        'paired',
        outcome.answerDigest,
      ),
      signature: _bytes(outcome.sig, 64),
    );
    if (verified && !ended()) {
      await pins.activate(
        machineId: pin.machineId,
        pairingId: pairingId,
        signerKey: signerKey,
        clock: now,
        account: account,
      );
    }
  }
}

Uint8List _bytes(String b64url, int length) =>
    Uint8List.fromList(fleetSecretFromB64url(b64url, length: length)!);
