import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/l10n/l10n.dart';

/// "What's happening now", composed only from the snapshot: running and
/// failed lanes, the main freeze and its queue, production and incidents,
/// and the logins blocking work.
String fleetDigest(
  AppLocalizations l10n,
  FleetSnapshot snapshot,
  DateTime now,
) {
  final counts = snapshot.counts;
  final release = snapshot.release;
  final logins = [
    for (final decision in snapshot.openLoginsAt(now))
      if (decision.login case final login?)
        switch (snapshot.machineLabel(login.machineId) ?? login.machineId) {
          final machine? => l10n.mastermindFleetLoginOn(
            login.service.label,
            machine,
          ),
          null => login.service.label,
        },
  ];
  return [
    l10n.mastermindFleetDigestLanes(counts.running),
    if (counts.failed > 0) l10n.mastermindFleetDigestFailed(counts.failed),
    if (release?.mainState == FleetMainState.frozen) ...[
      switch (release!.mainReason) {
        final reason? => l10n.mastermindFleetDigestFrozenReason(reason),
        null => l10n.mastermindFleetDigestFrozen,
      },
      if ((release.queued ?? 0) > 0)
        l10n.mastermindFleetDigestQueued(release.queued!),
    ],
    if (release?.production == FleetProductionState.down)
      l10n.mastermindFleetDigestProductionDown,
    if (release?.production == FleetProductionState.degraded)
      l10n.mastermindFleetDigestProductionDegraded,
    if (release != null && release.incidents.isNotEmpty)
      l10n.mastermindFleetDigestIncidents(release.incidents.length),
    if (logins.isNotEmpty)
      l10n.mastermindFleetDigestLogins(logins.length, logins.join(', ')),
  ].join(' ');
}

/// Open login requests at [now]: the "Blocked on login" figure.
int fleetOpenLogins(FleetSnapshot snapshot, DateTime now) =>
    snapshot.openLoginsAt(now).length;
