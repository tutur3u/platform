import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_interface_tokens.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/mastermind/presentation/inbox_model.dart';
import 'package:mobile/features/mastermind/view/widgets/large_text.dart';
import 'package:mobile/l10n/l10n.dart';

/// FYI starts collapsed when it holds more than this many asks.
const inboxFyiCollapseAbove = 5;

/// How a Needs-you tier reads: always a label and an icon, never colour alone.
extension InboxTierLook on InboxTier {
  String label(AppLocalizations l10n) => switch (this) {
    InboxTier.urgent => l10n.mastermindInboxTierUrgent,
    InboxTier.decision => l10n.mastermindInboxTierDecision,
    InboxTier.fyi => l10n.mastermindInboxTierFyi,
  };

  IconData get icon => switch (this) {
    InboxTier.urgent => LucideIcons.flame,
    InboxTier.decision => LucideIcons.scale,
    InboxTier.fyi => LucideIcons.info,
  };

  AppTone get tone => switch (this) {
    InboxTier.urgent => AppTone.destructive,
    InboxTier.decision => AppTone.warning,
    InboxTier.fyi => AppTone.neutral,
  };
}

/// The sticky heading of one tier: icon, label and count, plus "Show all" /
/// "Show less" when the tier can collapse. It paints the page background so
/// rows scroll under it while it is pinned.
class MastermindTierHeader extends StatelessWidget {
  const MastermindTierHeader({
    required this.tier,
    required this.count,
    this.expanded,
    this.onToggle,
    super.key,
  });

  final InboxTier tier;
  final int count;

  /// Whether the rows show; null when the tier never collapses.
  final bool? expanded;
  final VoidCallback? onToggle;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final label = tier.label(l10n);
    final expanded = this.expanded;
    return ColoredBox(
      color: c.background,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AppLayout.sectionCaptionInset,
          AppSpacing.sm,
          AppSpacing.xs,
          AppSpacing.sm,
        ),
        child: Row(
          children: [
            Expanded(
              child: Semantics(
                header: true,
                label: l10n.mastermindInboxTierHeading(label, count),
                excludeSemantics: true,
                child: Row(
                  children: [
                    AppIconTile(icon: tier.icon, tone: tier.tone, size: 28),
                    const SizedBox(width: AppSpacing.sm),
                    Flexible(
                      child: Text(
                        label,
                        style: tokens.typography.base.copyWith(
                          color: c.foreground,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Text(
                      '$count',
                      style: tokens.typography.small.copyWith(
                        color: tier.tone.foreground(c),
                        fontWeight: FontWeight.w600,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (expanded != null && onToggle != null)
              Flexible(
                child: Semantics(
                  expanded: expanded,
                  child: AppButton.ghost(
                    key: ValueKey('tier-toggle-${tier.queryValue}'),
                    size: AppButtonSize.small,
                    onPressed: onToggle,
                    child: Text(
                      expanded
                          ? l10n.mastermindInboxTierShowLess
                          : l10n.mastermindInboxTierShowAll(count),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// The three tier counts of "What needs me". Tapping one scrolls the list
/// to that tier; a tier with nothing in it is shown but inert.
class MastermindTierTiles extends StatelessWidget {
  const MastermindTierTiles({
    required this.counts,
    required this.onTier,
    super.key,
  });

  final Map<InboxTier, int> counts;
  final ValueChanged<InboxTier> onTier;

  @override
  Widget build(BuildContext context) {
    // Large text stacks full-width rows: a third of a phone cannot hold
    // "Cần bạn quyết định" at 200 %.
    final stacked = mastermindLargeText(context);
    final tiles = [
      for (final tier in InboxTier.values)
        _TierTile(
          tier: tier,
          count: counts[tier] ?? 0,
          stacked: stacked,
          onTap: () => onTier(tier),
        ),
    ];
    if (stacked) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: AppSpacing.sm,
        children: tiles,
      );
    }
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      spacing: AppSpacing.sm,
      children: [for (final tile in tiles) Expanded(child: tile)],
    );
  }
}

class _TierTile extends StatelessWidget {
  const _TierTile({
    required this.tier,
    required this.count,
    required this.stacked,
    required this.onTap,
  });

  final InboxTier tier;
  final int count;
  final bool stacked;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final type = tokens.typography;
    final label = tier.label(l10n);
    final tap = count > 0 ? onTap : null;
    final number = Text(
      '$count',
      style: (stacked ? type.base : type.xLarge)
          .merge(type.semiBold)
          .copyWith(
            color: c.foreground,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
    );
    final icon = Icon(tier.icon, size: 16, color: tier.tone.foreground(c));
    // Wraps, so "Cần bạn quyết định" never ellipsizes.
    final name = Text(
      label,
      style: type.small.copyWith(color: c.mutedForeground),
    );
    return Semantics(
      container: true,
      button: true,
      enabled: tap != null,
      label: l10n.mastermindInboxTierHeading(label, count),
      hint: tap == null ? null : l10n.mastermindInboxTierJump,
      onTap: tap,
      excludeSemantics: true,
      child: Material(
        key: ValueKey('tier-tile-${tier.queryValue}'),
        color: count > 0 ? tier.tone.fill(c) : c.card,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.sm),
          side: BorderSide(color: c.border),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: tap,
          child: ConstrainedBox(
            constraints: BoxConstraints(
              minHeight: stacked ? AppInterfaceTokens.minTouchTarget : 72,
              minWidth: AppInterfaceTokens.minTouchTarget,
            ),
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.sm),
              child: stacked
                  ? Row(
                      spacing: AppSpacing.sm,
                      children: [
                        icon,
                        Expanded(child: name),
                        number,
                      ],
                    )
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Row(
                          children: [
                            Expanded(child: number),
                            icon,
                          ],
                        ),
                        name,
                      ],
                    ),
            ),
          ),
        ),
      ),
    );
  }
}
