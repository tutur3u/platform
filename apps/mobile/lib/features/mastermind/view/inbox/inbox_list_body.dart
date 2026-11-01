import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/gmt7.dart';
import 'package:mobile/features/mastermind/presentation/inbox_model.dart';
import 'package:mobile/features/mastermind/presentation/inbox_paging.dart';
import 'package:mobile/features/mastermind/presentation/inbox_segment.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/features/mastermind/view/home_needs_you_card.dart';
import 'package:mobile/features/mastermind/view/inbox/inbox_item_tile.dart';
import 'package:mobile/features/mastermind/view/inbox/inbox_list_footer.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_group.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_status_chip.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_surface_slice.dart';
import 'package:mobile/l10n/l10n.dart';

/// The ask segments' list, as a sliver: an empty or no-match state with its
/// reason, or every group's asks built lazily a page at a time, then the
/// trailing Security group once the last page is in.
///
/// Nothing sits behind a toggle. The next page starts loading when a row
/// within [inboxPrefetchDistance] of the end is built, and [paging] says
/// whether it is loading or failed.
class InboxListBody extends StatelessWidget {
  const InboxListBody({
    required this.model,
    required this.paging,
    required this.onClearFilters,
    this.now,
    super.key,
  });

  final MastermindInboxModel model;
  final InboxPagingController paging;
  final VoidCallback onClearFilters;

  /// The section clock, for resolved ages.
  final DateTime? now;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: paging,
    builder: (context, _) {
      final l10n = context.l10n;
      if (model.groups.isEmpty) {
        return SliverToBoxAdapter(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (model.isEmpty)
                MastermindGroup(children: [_empty(l10n)])
              else
                _noMatches(l10n),
              if (model.security.isNotEmpty) _security(l10n, gap: false),
            ],
          ),
        );
      }
      final total = model.shownCount;
      final rows = inboxRows(model, paging.visible);
      final more = paging.hasMore(total);
      final failed = paging.status == InboxPagingStatus.error;
      final tail = <Widget>[
        if (failed)
          InboxLoadErrorRow(onRetry: () => paging.loadMore(total))
        else if (more)
          const InboxLoadingMoreRow(),
        if (!more && model.security.isNotEmpty) _security(l10n),
        if (!more && total > paging.pageSize) const InboxEndMarker(),
      ];
      return SliverList.builder(
        itemCount: rows.length + tail.length,
        itemBuilder: (context, index) {
          if (index >= rows.length) {
            if (more && !failed) paging.requestMore(total);
            return tail[index - rows.length];
          }
          return switch (rows[index]) {
            InboxHeaderRow(:final group, :final first) => _header(
              context,
              group,
              first: first,
            ),
            final InboxItemRow row => _item(total, row),
          };
        },
      );
    },
  );

  Widget _header(
    BuildContext context,
    InboxGroup group, {
    required bool first,
  }) => Padding(
    padding: EdgeInsets.only(top: first ? 0 : AppLayout.sectionGap),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        MastermindSectionHeader(
          _groupTitle(context, group),
          trailing: Text('${group.items.length}'),
        ),
        const SizedBox(height: AppLayout.sectionCaptionGap),
      ],
    ),
  );

  Widget _item(int total, InboxItemRow row) {
    if (row.ordinal >= paging.visible - inboxPrefetchDistance) {
      paging.requestMore(total);
    }
    return MastermindSurfaceSlice(
      key: ValueKey('inbox-row-${row.item.id}'),
      first: row.first,
      last: row.last,
      child: InboxItemTile(
        item: row.item,
        now: now,
        showKind: row.group.resolved,
        askCard: true,
      ),
    );
  }

  Widget _security(AppLocalizations l10n, {bool gap = true}) => Padding(
    padding: EdgeInsets.only(top: gap ? AppLayout.sectionGap : 0),
    child: MastermindGroup(
      caption: l10n.mastermindSecurityGroup,
      children: [
        for (final item in model.security)
          AppGroupedRow(
            leading: const AppIconTile(icon: LucideIcons.shield),
            title: Text(securityLine(l10n, item)),
            trailing: MastermindStatusChip(
              label: MastermindLabels.laneState(l10n, item.state),
            ),
          ),
      ],
    ),
  );

  Widget _noMatches(AppLocalizations l10n) => MastermindGroup(
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
  );

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

  static String _groupTitle(BuildContext context, InboxGroup group) {
    final l10n = context.l10n;
    if (group.resolved) {
      return switch (group.day) {
        final day? => Gmt7.date(
          day,
          Localizations.localeOf(context).toString(),
        ),
        null => l10n.mastermindRecentlyResolved,
      };
    }
    return switch (group.kind) {
      ItemKind.decision => l10n.mastermindGroupDecisions,
      ItemKind.action => l10n.mastermindGroupActions,
      ItemKind.fyi => l10n.mastermindGroupFyi,
      null => l10n.mastermindNeedsYouTitle,
    };
  }
}
