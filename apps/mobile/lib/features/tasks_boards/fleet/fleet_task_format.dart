import 'package:intl/intl.dart';
import 'package:mobile/features/tasks_boards/fleet/fleet_task_meta.dart';
import 'package:mobile/l10n/l10n.dart';

/// A duration as minutes, hours or days: `5m`, `3h`, `2d`.
String fleetSpanLabel(AppLocalizations l10n, Duration span) {
  final duration = span.isNegative ? -span : span;
  if (duration.inHours < 1) {
    return l10n.fleetSpanMinutes(
      duration.inMinutes < 1 ? 1 : duration.inMinutes,
    );
  }
  if (duration.inDays < 1) return l10n.fleetSpanHours(duration.inHours);
  return l10n.fleetSpanDays(duration.inDays);
}

/// "No update", "Just now" or "3h ago".
String fleetUpdatedLabel(
  AppLocalizations l10n,
  DateTime? lastUpdate, {
  required DateTime now,
}) {
  if (lastUpdate == null) return l10n.fleetUpdateNone;
  final age = now.difference(lastUpdate);
  if (age < const Duration(minutes: 1)) return l10n.fleetJustNow;
  return l10n.fleetUpdatedAgo(fleetSpanLabel(l10n, age));
}

/// "No ETA", "in 3h", "2d overdue", or the date of a finished card's ETA.
String fleetEtaLabel(
  AppLocalizations l10n,
  FleetTaskMeta meta, {
  required DateTime now,
  required String locale,
}) {
  final eta = meta.eta;
  if (eta == null) return l10n.fleetEtaNone;
  return switch (meta.etaState(now: now)) {
    FleetEtaState.overdue => l10n.fleetEtaOverdueBy(
      fleetSpanLabel(l10n, now.difference(eta)),
    ),
    FleetEtaState.dueSoon || FleetEtaState.onTrack when eta.isAfter(now) =>
      l10n.fleetEtaIn(fleetSpanLabel(l10n, eta.difference(now))),
    _ => DateFormat.MMMd(locale).format(eta.toLocal()),
  };
}
