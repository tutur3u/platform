import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/presentation/gmt7.dart';
import 'package:mobile/features/mastermind/runtime/mastermind_runtime.dart';
import 'package:mobile/l10n/l10n.dart';

/// Snooze choices for [decision] at [now]: 15 minutes, 1 hour, 08:00 the
/// next day in Mastermind time (UTC+7), and, while there is still room, until
/// 5 minutes before the deadline.
List<(String, DateTime)> fleetSnoozeChoices(
  AppLocalizations l10n,
  FleetDecision decision,
  DateTime now,
) {
  final wall = Gmt7.wallTime(now);
  final morning = DateTime.utc(
    wall.year,
    wall.month,
    wall.day + 1,
    8,
  ).subtract(const Duration(hours: 7));
  final beforeDeadline = decision.deadlineAt?.subtract(
    const Duration(minutes: 5),
  );
  return [
    (l10n.mastermindFleetSnooze15, now.add(const Duration(minutes: 15))),
    (l10n.mastermindFleetSnooze60, now.add(const Duration(hours: 1))),
    (l10n.mastermindFleetSnoozeMorning, morning),
    if (beforeDeadline != null && beforeDeadline.isAfter(now))
      (l10n.mastermindFleetSnoozeDeadline, beforeDeadline),
  ];
}

/// Opens the snooze sheet; a choice hides the card on this device and shows
/// a toast whose Undo brings it straight back.
Future<void> snoozeFleetDecision(
  BuildContext context,
  FleetDecision decision, {
  DateTime Function()? now,
}) async {
  final l10n = context.l10n;
  final current = (now ?? DateTime.now)().toUtc();
  final until = await showAppActionSheet<DateTime>(
    context: context,
    useRootNavigator: true,
    title: l10n.mastermindFleetSnooze,
    description: decision.title,
    actions: [
      for (final (label, time) in fleetSnoozeChoices(l10n, decision, current))
        AppSheetAction(label: label, value: time, icon: LucideIcons.alarmClock),
    ],
  );
  if (until == null || !context.mounted) return;
  await _applySnooze(context, decision, until);
}

/// Confirms only once the snooze is applied; when this device's stored
/// snoozes cannot be read, says so and offers Retry instead.
Future<void> _applySnooze(
  BuildContext context,
  FleetDecision decision,
  DateTime until,
) async {
  // A toast can outlive the Inbox; its Retry then does nothing.
  if (!context.mounted) return;
  final l10n = context.l10n;
  final snoozes = context.read<MastermindRuntime>().fleetSnoozes;
  final applied = await snoozes.snooze(decision.id, until);
  if (!context.mounted) return;
  if (!applied) {
    showAppToast(
      context,
      message: l10n.mastermindFleetSnoozeFailed,
      variant: AppAlertVariant.destructive,
      actionLabel: l10n.commonRetry,
      onAction: () {
        if (context.mounted) unawaited(_applySnooze(context, decision, until));
      },
    );
    return;
  }
  final locale = Localizations.localeOf(context).toLanguageTag();
  showAppToast(
    context,
    message: l10n.mastermindFleetSnoozedToast(Gmt7.time(until, locale)),
    actionLabel: l10n.mastermindFleetUndo,
    onAction: () => unawaited(snoozes.wake(decision.id)),
  );
}
