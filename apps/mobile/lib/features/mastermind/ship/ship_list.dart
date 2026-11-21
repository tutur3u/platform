import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/app_filter_bar.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_clock.dart';
import 'package:mobile/features/mastermind/ship/ship_banners.dart';
import 'package:mobile/features/mastermind/ship/ship_card.dart';
import 'package:mobile/features/mastermind/ship/ship_data.dart';
import 'package:mobile/features/mastermind/ship/ship_view.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_group.dart';
import 'package:mobile/l10n/l10n.dart';

/// The Ship content for one snapshot: its freshness, any source banner, the
/// filter pills and one card per app grouped by product.
class ShipList extends StatefulWidget {
  const ShipList({
    required this.snapshot,
    required this.checking,
    required this.refreshFailed,
    required this.onCheck,
    required this.onRetry,
    this.now,
    super.key,
  });

  final ShipSnapshot snapshot;
  final bool checking;

  /// The latest poll failed; the rows keep their own stamps.
  final bool refreshFailed;
  final VoidCallback onCheck;
  final VoidCallback onRetry;
  final DateTime Function()? now;

  @override
  State<ShipList> createState() => _ShipListState();
}

class _ShipListState extends State<ShipList> {
  ShipFilter _filter = ShipFilter.all;
  bool _showStale = false;

  @override
  void didUpdateWidget(ShipList oldWidget) {
    super.didUpdateWidget(oldWidget);
    // A successful read ends the opt-in, so the next failure hides again.
    if (oldWidget.refreshFailed && !widget.refreshFailed) _showStale = false;
  }

  @override
  Widget build(BuildContext context) => FleetClock(
    now: widget.now,
    builder: (context, now) {
      // A failed read or an all-sources outage hides rows unless the owner
      // asks for the last snapshot, which then shows marked stale.
      final failedRead = widget.refreshFailed;
      final view = ShipView(
        widget.snapshot,
        now,
        forceStale: failedRead && _showStale,
      );
      final page = view.page;
      final hidden = (failedRead || page == ShipPageKind.error) && !_showStale;
      return AppPageScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverList.list(
            children: [
              _FreshLine(view: view, checking: widget.checking),
              if (failedRead)
                ShipRefreshFailedBanner(
                  showingStale: _showStale,
                  onRetry: widget.onRetry,
                  onViewStale: () => setState(() => _showStale = true),
                )
              else if (page == ShipPageKind.partial)
                ShipPartialBanner(view: view),
              if (!failedRead && page == ShipPageKind.error)
                ShipErrorBanner(
                  view: view,
                  busy: widget.checking,
                  onRetry: widget.onCheck,
                  onViewStale: () => setState(() => _showStale = true),
                ),
              if (!hidden) ...[
                AppFilterBar<ShipFilter>(
                  options: [
                    for (final filter in ShipFilter.values)
                      AppFilterOption(
                        value: filter,
                        label: _filterLabel(context, filter, view),
                      ),
                  ],
                  selected: _filter,
                  onSelected: (filter) => setState(() => _filter = filter),
                ),
                for (final (group, ids) in shipGroups)
                  ..._group(context, view, group, ids),
              ],
            ],
          ),
        ],
      );
    },
  );

  List<Widget> _group(
    BuildContext context,
    ShipView view,
    String group,
    List<String> ids,
  ) {
    final apps = [
      for (final id in ids)
        for (final app in view.snapshot.apps)
          if (app.id == id && view.matches(app, _filter)) app,
    ];
    if (apps.isEmpty) return const [];
    return [
      MastermindSectionHeader(_groupLabel(context, group)),
      for (final app in apps) ShipCard(app: app, view: view),
    ];
  }

  static String _filterLabel(
    BuildContext context,
    ShipFilter filter,
    ShipView view,
  ) {
    final l10n = context.l10n;
    return switch (filter) {
      ShipFilter.all => l10n.mastermindShipLiveFilterAll,
      ShipFilter.waiting => l10n.mastermindShipLiveFilterWaiting(
        '${view.waiting}',
      ),
      ShipFilter.failing => l10n.mastermindShipLiveFilterFailing(
        '${view.count(ShipFilter.failing)}',
      ),
      ShipFilter.doubtful => l10n.mastermindShipLiveFilterDoubtful(
        '${view.count(ShipFilter.doubtful)}',
      ),
    };
  }

  static String _groupLabel(BuildContext context, String group) {
    final l10n = context.l10n;
    return switch (group) {
      'platform' => l10n.mastermindShipLiveGroupPlatform,
      'mobile' => l10n.mastermindShipLiveGroupMobile,
      'upskii' => l10n.mastermindShipLiveGroupUpskii,
      'masteryAi' => l10n.mastermindShipLiveGroupMasteryAi,
      _ => l10n.mastermindShipLiveGroupPktm,
    };
  }
}

class _FreshLine extends StatelessWidget {
  const _FreshLine({required this.view, required this.checking});

  final ShipView view;
  final bool checking;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final c = AppTokens.of(context).colorScheme;
    final theme = Theme.of(context).textTheme;
    final live = view.page == ShipPageKind.live && !view.forceStale;
    final tone = checking
        ? AppTone.info
        : live
        ? AppTone.success
        : AppTone.warning;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: Row(
        spacing: AppSpacing.xs,
        children: [
          DecoratedBox(
            decoration: BoxDecoration(
              color: tone.foreground(c),
              shape: BoxShape.circle,
            ),
            child: const SizedBox.square(dimension: 8),
          ),
          Expanded(
            child: Text(
              checking
                  ? l10n.mastermindShipLiveChecking
                  : view.forceStale
                  ? l10n.mastermindShipLiveFreshStale(
                      shipAge(context, view.snapshot.collectedAt, view.now),
                    )
                  : shipCheckedText(
                      context,
                      view.snapshot.collectedAt,
                      view.now,
                    ),
              style: theme.bodySmall,
            ),
          ),
          Text(
            l10n.mastermindShipLiveSources('${view.snapshot.sources.length}'),
            style: theme.bodySmall?.copyWith(color: c.mutedForeground),
          ),
        ],
      ),
    );
  }
}
