import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_alert.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/answered_via_labels.dart';
import 'package:mobile/features/mastermind/presentation/display_names.dart';
import 'package:mobile/features/mastermind/presentation/inbox_model.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/features/mastermind/view/inbox/recorded_answer.dart';
import 'package:mobile/features/mastermind/view/widgets/linkified_text.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_group.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_status_chip.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_time_label.dart';
import 'package:mobile/l10n/l10n.dart';

/// The ask itself, flat on the page background: the display title as a
/// heading, kind and product as soft chips, when it was asked (relative and
/// absolute GMT+7), then the full ask text the hub published (`ask_text`),
/// never ellipsized, with tappable links.
///
/// When the hub published only its "Open on Mac" stand-in, an info alert says
/// the details are on the Mac instead of leaving the pointer as body text.
class ItemQuestionCard extends StatelessWidget {
  const ItemQuestionCard({
    required this.item,
    this.now,
    this.fullText,
    this.deadline,
    super.key,
  });

  final NeedsYou item;
  final DateTime? now;
  final String? fullText;
  final AskDeadline? deadline;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final l10n = context.l10n;
    final body = (fullText ?? item.body).trim();
    final deadline = item.deadline ?? this.deadline;
    final urgency = switch (item.urgency) {
      AskUrgency.high => l10n.mastermindAskUrgencyHigh,
      AskUrgency.urgent => l10n.mastermindAskUrgencyUrgent,
      _ => null,
    };
    final asked = item.createdAt;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppLayout.sectionCaptionInset,
        AppSpacing.xs,
        AppLayout.sectionCaptionInset,
        AppLayout.sectionGap,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(
            header: true,
            child: Text(
              itemDisplayTitle(l10n, item),
              style: tokens.typography.xLarge.copyWith(
                color: c.foreground,
                fontWeight: FontWeight.w600,
                height: 1.3,
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Wrap(
            spacing: AppSpacing.xs,
            runSpacing: AppSpacing.xs,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              if (urgency != null)
                MastermindStatusChip(label: urgency, tone: AppTone.warning),
              if (deadline != null)
                MastermindStatusChip(label: _deadlineLabel(context, deadline)),
              if (item.kind case final kind?)
                MastermindStatusChip(
                  label: MastermindLabels.itemKind(l10n, kind),
                ),
              if (item.product case final product?)
                MastermindStatusChip(label: MastermindLabels.product(product)),
              if (item.state != ItemState.answered)
                MastermindStatusChip(
                  label: MastermindLabels.itemState(l10n, item.state),
                  icon: LucideIcons.circleDot,
                  tone: AppTone.info,
                ),
            ],
          ),
          if (asked != null && now != null) ...[
            const SizedBox(height: AppSpacing.sm),
            MastermindTimeLabel(
              asked,
              sentence: l10n.mastermindAskedTime,
              style: tokens.typography.small.copyWith(color: c.mutedForeground),
            ),
          ],
          if (item.askTruncated && fullText == null) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              l10n.mastermindAskTruncated,
              style: tokens.typography.small.copyWith(color: c.mutedForeground),
            ),
          ],
          const SizedBox(height: AppSpacing.lg),
          if (isOpenOnMacStandIn(body))
            AppAlert(
              leading: Icon(AppIcons.info, color: c.info),
              title: Text(l10n.mastermindItemOpenOnMac),
              content: Text(l10n.mastermindItemOpenOnMacReason),
            )
          else
            SelectionArea(
              child: fullText == null
                  ? LinkifiedText(
                      body,
                      style: tokens.typography.base.copyWith(
                        color: c.foreground,
                        height: 1.5,
                      ),
                    )
                  : Text(
                      body,
                      style: tokens.typography.base.copyWith(
                        color: c.foreground,
                        height: 1.5,
                      ),
                    ),
            ),
        ],
      ),
    );
  }
}

String _deadlineLabel(BuildContext context, AskDeadline deadline) {
  final l10n = context.l10n;
  return switch (deadline) {
    AskDeadline.withinHours => l10n.mastermindAskDeadlineWithinHours,
    AskDeadline.today => l10n.mastermindAskDeadlineToday,
    AskDeadline.tonight => l10n.mastermindAskDeadlineTonight,
    AskDeadline.thisWeek => l10n.mastermindAskDeadlineThisWeek,
  };
}

/// The outcome of an ask the hub lists as resolved: the hub's word, the answer
/// it recorded and when. A reply this device sent never shows as
/// resolved on its own; only `decisions_resolved` does.
class ItemResolvedPanel extends StatelessWidget {
  const ItemResolvedPanel({required this.item, super.key});

  final NeedsYou item;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final at = item.resolvedAt;
    final answer = item.resolution;
    return MastermindGroup(
      caption: l10n.mastermindResolvedOutcome,
      children: [
        AppGroupedRow(
          leading: item.state == ItemState.withdrawn
              ? const AppIconTile(icon: AppIcons.close)
              : const AppIconTile(icon: AppIcons.check, tone: AppTone.success),
          title: Semantics(
            liveRegion: true,
            child: Text(switch ((item.state, item.answeredVia)) {
              (ItemState.withdrawn, _) =>
                l10n.mastermindWithdrawnNoLongerNeeded,
              (_, final via?) => answeredViaText(l10n, via),
              _ => l10n.mastermindResolvedState,
            }),
          ),
          subtitle: item.state == ItemState.withdrawn
              ? null
              : answer == null
              ? Text(l10n.mastermindResolvedNoAnswer)
              : RecordedAnswer(answer: answer),
          trailing: at == null ? null : MastermindTimeLabel(at),
        ),
      ],
    );
  }
}
