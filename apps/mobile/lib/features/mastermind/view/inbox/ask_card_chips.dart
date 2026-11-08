import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/asks/ask_v2_support.dart';
import 'package:mobile/features/mastermind/model/enums.dart';
import 'package:mobile/features/mastermind/presentation/ask_card_source.dart';
import 'package:mobile/features/mastermind/presentation/gmt7.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/features/mastermind/view/inbox/ask_timing_chips.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_status_chip.dart';
import 'package:mobile/l10n/l10n.dart';

/// One status chip of the Inbox card: text plus an icon, never colour alone.
final class AskChipSpec {
  const AskChipSpec(this.label, {this.icon, this.tone = AppTone.neutral});

  final String label;
  final IconData? icon;
  final AppTone tone;

  Widget build() => MastermindStatusChip(label: label, icon: icon, tone: tone);
}

/// The fixed chip vocabulary of the Inbox card, in reading order: tier,
/// deadline, project, reversibility, biometric need, then how the ask closed.
/// An incomplete card adds its own warning chip.
List<AskChipSpec> askChipSpecs(
  AppLocalizations l10n,
  InboxAsk ask, {
  required String locale,
  required DateTime now,
  bool includeTiming = true,
}) {
  final card = ask.card;
  final open = card.phase == AskPhase.open;
  return [
    if (open && includeTiming)
      switch (card.inboxClass) {
        AskInboxClass.urgent => AskChipSpec(
          l10n.mastermindAskUrgencyUrgent,
          icon: LucideIcons.flame,
          tone: AppTone.destructive,
        ),
        AskInboxClass.decision => AskChipSpec(
          l10n.mastermindAskCardTierDecision,
          icon: LucideIcons.scale,
          tone: AppTone.warning,
        ),
        AskInboxClass.fyi => AskChipSpec(
          l10n.mastermindAskCardTierFyi,
          icon: LucideIcons.info,
        ),
      },
    if (open &&
        includeTiming &&
        ask.legacyUrgency == AskUrgency.high &&
        card.inboxClass != AskInboxClass.urgent)
      AskChipSpec(
        l10n.mastermindAskUrgencyHigh,
        icon: LucideIcons.arrowUp,
        tone: AppTone.warning,
      ),
    if (open && includeTiming) ?_deadline(l10n, ask, locale: locale, now: now),
    if (includeTiming)
      if (ask.product case final product?)
        AskChipSpec(MastermindLabels.product(product)),
    if (open && ask.reversible != null)
      if (ask.reversible!)
        AskChipSpec(l10n.mastermindAskCardReversible, icon: LucideIcons.undo2)
      else
        AskChipSpec(
          l10n.mastermindAskCardOneWay,
          icon: LucideIcons.lock,
          tone: AppTone.warning,
        ),
    if (open && card.risky)
      AskChipSpec(
        l10n.mastermindAskCardNeedsBiometric,
        icon: LucideIcons.fingerprint,
        tone: AppTone.info,
      ),
    if (card.phase == AskPhase.expired)
      AskChipSpec(
        l10n.mastermindAskCardExpired,
        icon: LucideIcons.hourglass,
        tone: AppTone.warning,
      ),
    if (card.phase == AskPhase.answered && card.resolvedVia != null)
      AskChipSpec(
        _resolvedVia(l10n, card.resolvedVia!),
        icon: LucideIcons.check,
        tone: AppTone.success,
      ),
    if (card.incomplete)
      AskChipSpec(
        l10n.mastermindAskCardIncomplete,
        icon: LucideIcons.triangleAlert,
        tone: AppTone.warning,
      ),
  ];
}

AskChipSpec? _deadline(
  AppLocalizations l10n,
  InboxAsk ask, {
  required String locale,
  required DateTime now,
}) {
  final at = ask.card.deadlineAt;
  if (at == null) {
    final bucket = ask.deadlineBucket;
    return bucket == null
        ? null
        : AskChipSpec(
            askDeadlineLabel(l10n, bucket),
            icon: LucideIcons.hourglass,
          );
  }
  if (at.isBefore(now)) {
    return AskChipSpec(
      l10n.mastermindAskCardOverdue,
      icon: LucideIcons.hourglass,
      tone: AppTone.destructive,
    );
  }
  final due = Gmt7.wallTime(at);
  final today = Gmt7.wallTime(now);
  final sameDay =
      due.year == today.year &&
      due.month == today.month &&
      due.day == today.day;
  final time = Gmt7.time(at, locale);
  return AskChipSpec(
    l10n.mastermindAskCardDue(sameDay ? time : '${Gmt7.day(at, locale)} $time'),
    icon: LucideIcons.hourglass,
    tone: sameDay ? AppTone.warning : AppTone.neutral,
  );
}

String _resolvedVia(AppLocalizations l10n, AskResolvedVia via) => switch (via) {
  AskResolvedVia.mobile => l10n.mastermindAnsweredOnPhone,
  AskResolvedVia.mac => l10n.mastermindAnsweredOnMac,
  AskResolvedVia.discord => l10n.mastermindAskCardAnsweredDiscord,
  AskResolvedVia.agent => l10n.mastermindAskCardAnsweredAgent,
};
