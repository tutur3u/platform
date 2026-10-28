import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_badge.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/inbox_model.dart';
import 'package:mobile/features/mastermind/presentation/inbox_segment.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/features/mastermind/view/home_needs_you_card.dart';
import 'package:mobile/features/mastermind/view/inbox/inbox_item_tile.dart';
import 'package:mobile/features/mastermind/view/widgets/show_all_row.dart';
import 'package:mobile/l10n/l10n.dart';

/// The ask segments' list: an empty or no-match state with its reason, the
/// groups (each capped at [MastermindInboxModel.groupCap] until "Show all N"),
/// then the trailing Security group.
class InboxListBody extends StatelessWidget {
  const InboxListBody({
    required this.model,
    required this.expanded,
    required this.onExpand,
    required this.onClearFilters,
    this.now,
    super.key,
  });

  final MastermindInboxModel model;

  /// [InboxGroup.key]s the user expanded past the cap.
  final Set<String> expanded;
  final ValueChanged<String> onExpand;
  final VoidCallback onClearFilters;

  /// The section clock, for resolved ages.
  final DateTime? now;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (model.isEmpty)
          AppGroupedSection.spaced(children: [_empty(l10n)])
        else if (model.hasNoMatches)
          AppGroupedSection.spaced(
            children: [
              AppStateMessage.inline(
                icon: LucideIcons.searchX,
                title: l10n.mastermindInboxNoMatches,
                message: l10n.mastermindInboxNoMatchesReason,
              ),
              AppGroupedRow(
                leading: const AppIconTile(icon: AppIcons.close),
                title: Text(l10n.mastermindInboxClearFilters),
                onTap: onClearFilters,
              ),
            ],
          ),
        for (final group in model.groups) _group(l10n, group),
        if (model.security.isNotEmpty)
          AppGroupedSection.spaced(
            caption: l10n.mastermindSecurityGroup,
            children: [
              for (final item in model.security)
                AppGroupedRow(
                  leading: const AppIconTile(icon: LucideIcons.shield),
                  title: Text(securityLine(l10n, item)),
                  trailing: AppBadge.outline(
                    child: Text(MastermindLabels.laneState(l10n, item.state)),
                  ),
                ),
            ],
          ),
      ],
    );
  }

  Widget _empty(AppLocalizations l10n) => switch (model.segment) {
    InboxSegment.resolved => AppStateMessage.inline(
      icon: LucideIcons.history,
      title: l10n.mastermindNothingResolved,
      message: l10n.mastermindNothingResolvedReason,
    ),
    _ => AppStateMessage.inline(
      icon: AppIcons.check,
      title: model.security.isEmpty
          ? l10n.mastermindNothingNeedsYou
          : l10n.mastermindNothingNeedsReply,
      message: l10n.mastermindNothingNeedsYouReason,
    ),
  };

  Widget _group(AppLocalizations l10n, InboxGroup group) {
    final open = expanded.contains(group.key);
    final capped = !open && group.items.length > MastermindInboxModel.groupCap;
    final items = capped
        ? group.items.take(MastermindInboxModel.groupCap)
        : group.items;
    return AppGroupedSection.spaced(
      caption: _groupTitle(l10n, group),
      captionTrailing: Text('${group.items.length}'),
      children: [
        for (final item in items)
          InboxItemTile(item: item, now: now, showKind: group.resolved),
        if (capped)
          MastermindShowAllRow(
            count: group.items.length,
            onTap: () => onExpand(group.key),
          ),
      ],
    );
  }

  static String _groupTitle(AppLocalizations l10n, InboxGroup group) {
    if (group.resolved) return l10n.mastermindRecentlyResolved;
    return switch (group.kind) {
      ItemKind.decision => l10n.mastermindGroupDecisions,
      ItemKind.action => l10n.mastermindGroupActions,
      ItemKind.fyi => l10n.mastermindGroupFyi,
      null => l10n.mastermindNeedsYouTitle,
    };
  }
}
