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
import 'package:mobile/features/mastermind/view/inbox/tier_header.dart';
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
    this.tierKeys = const {},
    this.fyiExpanded,
    this.onToggleFyi,
    super.key,
  });

  /// Whether FYI shows its rows; null when it is short enough to never
  /// collapse.
  final bool? fyiExpanded;
  final VoidCallback? onToggleFyi;

  final MastermindInboxModel model;
  final InboxPagingController paging;
  final VoidCallback onClearFilters;

  /// The section clock, for resolved ages.
  final DateTime? now;

  /// Scroll targets for the tier headings, for `?tier=`.
  final Map<InboxTier, GlobalKey> tierKeys;

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
      // The footer rides in the last section's list, so it is built only
      // when scrolled near, like the rows.
      final footer = [
        for (final widget in tail)
          (BuildContext _) {
            if (more && !failed) paging.requestMore(total);
            return widget;
          },
      ];
      final sections = _sections(rows);
      return SliverMainAxisGroup(
        slivers: [
          for (final (i, section) in sections.indexed)
            ..._section(
              total,
              section,
              i == sections.length - 1 ? footer : const [],
            ),
        ],
      );
    },
  );

  Widget _row(BuildContext context, int total, InboxRow row) => switch (row) {
    InboxHeaderRow(:final group, :final first) => _header(
      context,
      group,
      first: first,
    ),
    final InboxItemRow item => _item(total, item),
  };

  /// [rows] cut into runs that each open with their heading.
  static List<List<InboxRow>> _sections(List<InboxRow> rows) {
    final sections = <List<InboxRow>>[];
    for (final row in rows) {
      if (row is InboxHeaderRow || sections.isEmpty) sections.add([]);
      sections.last.add(row);
    }
    return sections;
  }

  /// A tier is its own sliver group, so its heading stays pinned only while
  /// its rows are on screen; collapsed, it shows the heading alone. Kind and
  /// resolved groups scroll as plain rows.
  List<Widget> _section(
    int total,
    List<InboxRow> section,
    List<WidgetBuilder> footer,
  ) {
    SliverList list(Iterable<InboxRow> rows) {
      final builders = [
        for (final row in rows) (BuildContext c) => _row(c, total, row),
        ...footer,
      ];
      return SliverList.builder(
        itemCount: builders.length,
        itemBuilder: (context, i) => builders[i](context),
      );
    }

    final head = section.first;
    final tier = head is InboxHeaderRow ? head.group.tier : null;
    if (head is! InboxHeaderRow || tier == null) return [list(section)];
    final expanded = tier == InboxTier.fyi ? fyiExpanded : null;
    return [
      if (!head.first)
        const SliverToBoxAdapter(child: SizedBox(height: AppLayout.sectionGap)),
      SliverMainAxisGroup(
        slivers: [
          PinnedHeaderSliver(
            child: MastermindTierHeader(
              key: tierKeys[tier],
              tier: tier,
              count: head.group.items.length,
              expanded: expanded,
              onToggle: onToggleFyi,
            ),
          ),
          list(expanded == false ? const [] : section.skip(1)),
        ],
      ),
    ];
  }

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
