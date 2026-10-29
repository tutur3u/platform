import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_control_target.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/mastermind/catchup/catchup_models.dart';
import 'package:mobile/features/mastermind/catchup/catchup_navigation.dart';
import 'package:mobile/features/mastermind/catchup/catchup_row.dart';
import 'package:mobile/features/mastermind/catchup/catchup_view_model.dart';
import 'package:mobile/l10n/l10n.dart';

/// One digest section: a caption with its count, then the rows grouped per
/// product under collapsible headers. Rows without a product have no header.
class CatchupSectionCard extends StatelessWidget {
  const CatchupSectionCard({
    required this.section,
    required this.digest,
    required this.now,
    required this.isCollapsed,
    required this.onToggle,
    required this.onOpen,
    super.key,
  });

  final CatchupSectionView section;
  final CatchupDigest digest;
  final DateTime now;
  final bool Function(String key) isCollapsed;
  final void Function(String key, {required bool collapsed}) onToggle;
  final void Function(CatchupItem item) onOpen;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final caption = switch (section.key) {
      CatchupSectionKey.needsYou => l10n.mastermindNeedsYouTitle,
      CatchupSectionKey.shipped => l10n.mastermindCatchupSectionShipped,
      CatchupSectionKey.blocked => l10n.mastermindCatchupSectionBlocked,
      CatchupSectionKey.changed => l10n.mastermindCatchupSectionChanged,
      CatchupSectionKey.usageHealth => l10n.mastermindCatchupSectionUsage,
      CatchupSectionKey.unknown => l10n.mastermindCatchupSectionOther,
    };
    return AppGroupedSection.spaced(
      key: ValueKey('catchup-section-${section.key.wireName}'),
      caption: caption,
      captionTrailing: Text('${section.count}'),
      children: [
        for (final group in section.groups)
          CatchupGroup(
            group: group,
            productName: group.slug == null
                ? null
                : digest.productName(group.slug!),
            now: now,
            collapsed: isCollapsed(group.collapseKey),
            onToggle: (collapsed) =>
                onToggle(group.collapseKey, collapsed: collapsed),
            onOpen: onOpen,
          ),
      ],
    );
  }
}

class CatchupGroup extends StatelessWidget {
  const CatchupGroup({
    required this.group,
    required this.productName,
    required this.now,
    required this.collapsed,
    required this.onToggle,
    required this.onOpen,
    super.key,
  });

  final CatchupGroupView group;
  final String? productName;
  final DateTime now;
  final bool collapsed;
  final ValueChanged<bool> onToggle;
  final void Function(CatchupItem item) onOpen;

  @override
  Widget build(BuildContext context) {
    final name = productName;
    final rows = <Widget>[
      for (final (index, item) in group.items.indexed) ...[
        if (group.hasDivider && index == group.newCount)
          const CatchupNewDivider(),
        CatchupRow(
          item: item,
          now: now,
          sectionKey: group.sectionKey,
          productName: name,
          onOpen: catchupItemIsTappable(item) ? () => onOpen(item) : null,
        ),
      ],
    ];
    if (name == null) {
      return Column(mainAxisSize: MainAxisSize.min, children: rows);
    }
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(
          button: true,
          expanded: !collapsed,
          onTap: () => onToggle(!collapsed),
          label: l10n.mastermindCatchupGroupLabel(name, group.items.length),
          excludeSemantics: true,
          child: AppControlTarget(
            key: ValueKey('catchup-group-${group.collapseKey}'),
            onTap: () => onToggle(!collapsed),
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 44),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppLayout.rowHorizontalPadding,
                  vertical: AppSpacing.sm,
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        name,
                        style: tokens.typography.small.copyWith(
                          color: tokens.colorScheme.mutedForeground,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    Text(
                      '${group.items.length}',
                      style: tokens.typography.small.copyWith(
                        color: tokens.colorScheme.mutedForeground,
                      ),
                    ),
                    const SizedBox(width: AppSpacing.xs),
                    Icon(
                      collapsed
                          ? LucideIcons.chevronDown
                          : LucideIcons.chevronUp,
                      size: 16,
                      color: tokens.colorScheme.mutedForeground,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
        if (!collapsed) ...rows,
      ],
    );
  }
}

/// "New since your last visit" where the new rows end.
class CatchupNewDivider extends StatelessWidget {
  const CatchupNewDivider({super.key});

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppLayout.rowHorizontalPadding,
        vertical: AppSpacing.xs,
      ),
      child: Row(
        children: [
          Icon(LucideIcons.arrowUp, size: 14, color: colors.primary),
          const SizedBox(width: AppSpacing.xs),
          Flexible(
            child: Text(
              context.l10n.mastermindCatchupNewDivider,
              style: tokens.typography.small.copyWith(color: colors.primary),
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(child: Divider(height: 1, color: colors.primary)),
        ],
      ),
    );
  }
}
