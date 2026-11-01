import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/mastermind/iris/data/iris_models.dart';
import 'package:mobile/features/mastermind/presentation/what_needs_me.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_status_chip.dart';
import 'package:mobile/l10n/l10n.dart';

/// "What needs me": open asks by urgency as counts, then (when the Iris
/// relay answers) role status and its usage line, and "Use recommendations"
/// when at least one open ask has a recommended answer to send.
///
/// The counts come from the hub snapshot, the one answer source; the relay's
/// summary adds only what the hub lacks.
class WhatNeedsMeHeader extends StatelessWidget {
  const WhatNeedsMeHeader({
    required this.counts,
    this.summary,
    this.onUseRecommendations,
    super.key,
  });

  final WhatNeedsMeCounts counts;
  final IrisSummary? summary;

  /// Null hides the action (nothing to recommend, or replies are off).
  final VoidCallback? onUseRecommendations;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final muted = tokens.typography.small.copyWith(
      color: tokens.colorScheme.mutedForeground,
    );
    final roles = summary?.roles ?? const [];
    final usage = summary?.usage;
    return Padding(
      key: const ValueKey('what-needs-me'),
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(
            header: true,
            child: Text(
              l10n.mastermindIrisWhatNeedsMe,
              style: tokens.typography.base.copyWith(
                color: tokens.colorScheme.foreground,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          if (counts.total == 0)
            Text(l10n.mastermindIrisNothingNeedsYou, style: muted)
          else
            Wrap(
              spacing: AppSpacing.xs,
              runSpacing: AppSpacing.xs,
              children: [
                if (counts.urgent > 0)
                  MastermindStatusChip(
                    key: const ValueKey('what-needs-me-urgent'),
                    label: l10n.mastermindIrisCountUrgent(counts.urgent),
                    icon: LucideIcons.flame,
                    tone: AppTone.destructive,
                  ),
                if (counts.soon > 0)
                  MastermindStatusChip(
                    key: const ValueKey('what-needs-me-soon'),
                    label: l10n.mastermindIrisCountSoon(counts.soon),
                    icon: LucideIcons.arrowUp,
                    tone: AppTone.warning,
                  ),
                if (counts.fyi > 0)
                  MastermindStatusChip(
                    key: const ValueKey('what-needs-me-fyi'),
                    label: l10n.mastermindIrisCountFyi(counts.fyi),
                    icon: LucideIcons.info,
                  ),
                if (counts.other > 0)
                  MastermindStatusChip(
                    key: const ValueKey('what-needs-me-other'),
                    label: l10n.mastermindIrisCountOther(counts.other),
                  ),
              ],
            ),
          if (roles.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              roles
                  .map(
                    (r) => l10n.mastermindIrisRoleLine(
                      r.role,
                      irisRoleStatusText(l10n, r.status),
                    ),
                  )
                  .join(' · '),
              style: muted,
            ),
          ],
          if (usage != null && usage.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(usage, style: muted),
          ],
          if (onUseRecommendations != null) ...[
            const SizedBox(height: AppSpacing.sm),
            AppButton.outline(
              key: const ValueKey('use-recommendations'),
              onPressed: onUseRecommendations,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(LucideIcons.listChecks, size: 16),
                  const SizedBox(width: AppSpacing.sm),
                  Flexible(child: Text(l10n.mastermindIrisUseRecommendations)),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

String irisRoleStatusText(AppLocalizations l10n, IrisRoleStatus status) =>
    switch (status) {
      IrisRoleStatus.armed => l10n.mastermindIrisRoleArmed,
      IrisRoleStatus.running => l10n.mastermindIrisRoleRunning,
      IrisRoleStatus.stalled => l10n.mastermindIrisRoleStalled,
      IrisRoleStatus.idle => l10n.mastermindIrisRoleIdle,
    };
