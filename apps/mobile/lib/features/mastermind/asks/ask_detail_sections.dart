import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_badge.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/asks/ask_detail.dart';
import 'package:mobile/features/mastermind/presentation/gmt7.dart';
import 'package:mobile/l10n/l10n.dart';

/// Opens one allowlisted link in the system browser.
typedef AskLinkOpener = Future<void> Function(Uri url);

/// The sections only the optional full ask can fill: the action kind, why the
/// option is recommended, what happens with no answer, the risk facts, and
/// the links. Each renders only when its field is present.
class AskDetailSections extends StatelessWidget {
  const AskDetailSections({
    required this.detail,
    required this.onOpenLink,
    super.key,
  });

  final AskDetail detail;
  final AskLinkOpener onOpenLink;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final locale = Localizations.localeOf(context).toString();
    final reason = detail.reason;
    final fallback = detail.defaultOption;
    final due = detail.deadlineAt;
    final facts = <Widget>[
      if (detail.risk case final risk?)
        AppGroupedRow(
          leading: const AppIconTile(icon: LucideIcons.flag),
          title: Text(l10n.mastermindAskRisk(risk)),
        ),
      if (detail.reversible case final reversible?)
        AppGroupedRow(
          leading: const AppIconTile(icon: LucideIcons.undo2),
          title: Text(
            reversible
                ? l10n.mastermindAskReversible
                : l10n.mastermindAskNotReversible,
          ),
        ),
      if (detail.blocksCount case final blocks? when blocks > 0)
        AppGroupedRow(
          leading: const AppIconTile(icon: LucideIcons.hand),
          title: Text(l10n.mastermindAskBlocks(blocks)),
        ),
      if (due != null)
        AppGroupedRow(
          leading: const AppIconTile(icon: LucideIcons.alarmClock),
          title: Text(
            l10n.mastermindAskDueAt(
              '${Gmt7.day(due, locale)}, ${Gmt7.time(due, locale)}',
            ),
          ),
        ),
      if (detail.answeredVia case final via?)
        AppGroupedRow(
          leading: const AppIconTile(icon: AppIcons.check),
          title: Text(_answeredVia(context, via)),
        ),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (detail.actionKind case final kind?)
          AskActionKindSection(kind: kind, summary: detail.actionSummary),
        if (reason != null)
          AppGroupedSection.spaced(
            caption: l10n.mastermindAskWhyRecommended,
            children: [
              AppGroupedRow(
                leading: const AppIconTile(icon: LucideIcons.lightbulb),
                title: SelectionArea(child: Text(reason)),
              ),
            ],
          ),
        if (fallback != null)
          AppGroupedSection.spaced(
            caption: l10n.mastermindAskIfNoAnswerTitle,
            children: [
              AppGroupedRow(
                leading: const AppIconTile(icon: LucideIcons.clock),
                title: Text(l10n.mastermindAskIfNoAnswer(fallback)),
              ),
            ],
          ),
        if (facts.isNotEmpty) AppGroupedSection.spaced(children: facts),
        if (detail.links.isNotEmpty)
          AppGroupedSection.spaced(
            caption: l10n.mastermindAskLinksTitle,
            children: [
              for (final link in detail.links)
                AppGroupedRow(
                  leading: const AppIconTile(icon: LucideIcons.link),
                  title: Text(link.label),
                  trailing: const Icon(LucideIcons.externalLink, size: 18),
                  onTap: () => onOpenLink(link.url),
                ),
            ],
          ),
      ],
    );
  }

  static String _answeredVia(BuildContext context, AskAnsweredVia via) {
    final l10n = context.l10n;
    return switch (via) {
      AskAnsweredVia.phone => l10n.mastermindAskAnsweredPhone,
      AskAnsweredVia.mac => l10n.mastermindAskAnsweredMac,
      AskAnsweredVia.chat => l10n.mastermindAskAnsweredChat,
      AskAnsweredVia.auto => l10n.mastermindAskAnsweredAuto,
      AskAnsweredVia.batch => l10n.mastermindAskAnsweredBatch,
      AskAnsweredVia.elsewhere => l10n.mastermindAskAnsweredElsewhere,
    };
  }
}

/// Where the ask can be settled. "Run at your Mac" offers a reminder that is
/// not built yet, so it stays disabled with a "coming soon" note.
class AskActionKindSection extends StatelessWidget {
  const AskActionKindSection({required this.kind, this.summary, super.key});

  final AskActionKind kind;
  final String? summary;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final (icon, label) = switch (kind) {
      AskActionKind.answer => (
        LucideIcons.messageSquare,
        l10n.mastermindAskActionAnswer,
      ),
      AskActionKind.runOnMac => (
        LucideIcons.monitor,
        l10n.mastermindAskActionRunOnMac,
      ),
      AskActionKind.physical => (
        LucideIcons.hand,
        l10n.mastermindAskActionPhysical,
      ),
      AskActionKind.fyi => (LucideIcons.info, l10n.mastermindAskActionFyi),
    };
    return AppGroupedSection.spaced(
      children: [
        AppGroupedRow(
          leading: AppIconTile(icon: icon),
          title: Wrap(children: [AppBadge.outline(child: Text(label))]),
          subtitle: summary == null ? null : Text(summary!),
        ),
        if (kind == AskActionKind.runOnMac)
          AppGroupedRow(
            leading: const AppIconTile(icon: LucideIcons.bellRing),
            title: AppButton.outline(
              onPressed: null,
              child: Text(l10n.mastermindAskRemindAtMac),
            ),
            subtitle: Text(l10n.mastermindAskRemindAtMacSoon),
          ),
      ],
    );
  }
}
