import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_status_chip.dart';
import 'package:mobile/l10n/l10n.dart';

/// The urgency badge and deadline label for an open ask, shared by the Inbox
/// row and the detail page. Each carries a glyph, so urgency is never colour
/// alone. Nothing is shown for an ask without publisher timing.
List<Widget> askTimingChips(
  AppLocalizations l10n,
  NeedsYou item, {
  AskDeadline? deadline,
}) {
  final due = item.deadline ?? deadline;
  return [
    if (item.urgency == AskUrgency.urgent)
      MastermindStatusChip(
        key: ValueKey('ask-urgency-${item.id}'),
        label: l10n.mastermindAskUrgencyUrgent,
        icon: LucideIcons.flame,
        tone: AppTone.destructive,
      )
    else if (item.urgency == AskUrgency.high)
      MastermindStatusChip(
        key: ValueKey('ask-urgency-${item.id}'),
        label: l10n.mastermindAskUrgencyHigh,
        icon: LucideIcons.arrowUp,
        tone: AppTone.warning,
      ),
    if (due != null)
      MastermindStatusChip(
        key: ValueKey('ask-deadline-${item.id}'),
        label: askDeadlineLabel(l10n, due),
        icon: LucideIcons.hourglass,
      ),
  ];
}

/// The same badges as words, for the row's single semantics label.
List<String> askTimingSpoken(AppLocalizations l10n, NeedsYou item) => [
  if (item.urgency == AskUrgency.urgent)
    l10n.mastermindAskUrgencyUrgent
  else if (item.urgency == AskUrgency.high)
    l10n.mastermindAskUrgencyHigh,
  if (item.deadline case final due?) askDeadlineLabel(l10n, due),
];

String askDeadlineLabel(AppLocalizations l10n, AskDeadline deadline) =>
    switch (deadline) {
      AskDeadline.withinHours => l10n.mastermindAskDeadlineWithinHours,
      AskDeadline.today => l10n.mastermindAskDeadlineToday,
      AskDeadline.tonight => l10n.mastermindAskDeadlineTonight,
      AskDeadline.thisWeek => l10n.mastermindAskDeadlineThisWeek,
    };
