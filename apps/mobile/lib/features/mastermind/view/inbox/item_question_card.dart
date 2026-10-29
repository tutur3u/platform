import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_alert.dart';
import 'package:mobile/core/ui/components/app_badge.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/age_text.dart';
import 'package:mobile/features/mastermind/presentation/answered_via_labels.dart';
import 'package:mobile/features/mastermind/presentation/display_names.dart';
import 'package:mobile/features/mastermind/presentation/gmt7.dart';
import 'package:mobile/features/mastermind/presentation/inbox_model.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/features/mastermind/view/inbox/recorded_answer.dart';
import 'package:mobile/l10n/l10n.dart';

/// The ask itself: the display title as a heading, kind and product, then the
/// full ask text the hub published (`ask_text`), never ellipsized.
///
/// When the hub published only its "Open on Mac" stand-in, an info alert says
/// the details are on the Mac instead of leaving the pointer as body text.
class ItemQuestionCard extends StatelessWidget {
  const ItemQuestionCard({required this.item, this.now, super.key});

  final NeedsYou item;
  final DateTime? now;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final l10n = context.l10n;
    final body = item.body.trim();
    return AppGroupedSection.spaced(
      children: [
        Padding(
          padding: const EdgeInsets.all(AppLayout.rowHorizontalPadding),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Semantics(
                header: true,
                child: Text(
                  itemDisplayTitle(l10n, item),
                  style: tokens.typography.h4.copyWith(
                    color: tokens.colorScheme.foreground,
                  ),
                ),
              ),
              ...[
                const SizedBox(height: AppSpacing.sm),
                Wrap(
                  spacing: AppSpacing.xs,
                  runSpacing: AppSpacing.xs,
                  children: [
                    if (item.state != ItemState.answered)
                      Text(MastermindLabels.itemState(l10n, item.state)),
                    if (item.createdAt != null && now != null)
                      Text(
                        mastermindAgeText(
                          l10n,
                          now!.difference(item.createdAt!),
                        ),
                      ),
                    if (item.kind case final kind?)
                      AppBadge(
                        child: Text(MastermindLabels.itemKind(l10n, kind)),
                      ),
                    if (item.product case final product?)
                      AppBadge.outline(
                        child: Text(MastermindLabels.product(product)),
                      ),
                  ],
                ),
              ],
              if (item.askTruncated) Text(l10n.mastermindAskTruncated),
              const SizedBox(height: AppSpacing.md),
              if (isOpenOnMacStandIn(body))
                AppAlert(
                  leading: Icon(AppIcons.info, color: tokens.colorScheme.info),
                  title: Text(l10n.mastermindItemOpenOnMac),
                  content: Text(l10n.mastermindItemOpenOnMacReason),
                )
              else
                Text(
                  body,
                  style: tokens.typography.base.copyWith(
                    color: tokens.colorScheme.foreground,
                    height: 1.4,
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

/// The outcome of an ask the hub lists as resolved: the hub's word, the answer
/// it recorded and when (GMT+7). A reply this device sent never shows as
/// resolved on its own; only `decisions_resolved` does.
class ItemResolvedPanel extends StatelessWidget {
  const ItemResolvedPanel({required this.item, super.key});

  final NeedsYou item;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final locale = Localizations.localeOf(context).toString();
    final at = item.resolvedAt;
    final when = at == null
        ? null
        : '${Gmt7.day(at, locale)}, ${Gmt7.time(at, locale)}';
    final answer = item.resolution;
    return AppGroupedSection.spaced(
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
          trailing: when == null ? null : Text(when),
        ),
      ],
    );
  }
}
