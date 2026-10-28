import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_badge.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/features/mastermind/presentation/work_model.dart';
import 'package:mobile/features/mastermind/view/home_needs_you_card.dart';
import 'package:mobile/features/mastermind/view/mastermind_freshness_strip.dart';
import 'package:mobile/features/mastermind/view/mastermind_section.dart';
import 'package:mobile/features/mastermind/view/work/lane_tile.dart';
import 'package:mobile/features/mastermind/view/work/work_filters.dart';
import 'package:mobile/l10n/l10n.dart';

/// `/mastermind/work`: lanes grouped by state, most urgent state first.
///
/// [initialState] is the `?state=` filter a Home lane chip links with. It is
/// only a starting filter: the chips below change it and "All" clears it.
class MastermindWorkPage extends StatefulWidget {
  const MastermindWorkPage({this.initialState, super.key});

  final LaneState? initialState;

  @override
  State<MastermindWorkPage> createState() => _MastermindWorkPageState();
}

class _MastermindWorkPageState extends State<MastermindWorkPage> {
  final _search = TextEditingController();
  String _query = '';
  late LaneState? _state = widget.initialState;
  Product? _product;

  @override
  void didUpdateWidget(MastermindWorkPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Another Home chip while this page is already open.
    if (oldWidget.initialState != widget.initialState) {
      _state = widget.initialState;
    }
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  MastermindWorkModel _model(MastermindSnapshot snapshot) =>
      MastermindWorkModel.from(
        snapshot,
        query: _query,
        state: _state,
        product: _product,
      );

  @override
  Widget build(BuildContext context) => MastermindSection(
    builder: (context, ready, freshness) {
      var model = _model(ready.snapshot);
      // The product chips only exist while two products are present: a filter
      // whose chip is gone could never be cleared and would strand the list.
      if (_product != null &&
          (model.products.length < 2 || !model.products.contains(_product))) {
        _product = null;
        model = _model(ready.snapshot);
      }
      return AppPageScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(
            child: MastermindFreshnessStrip(freshness: freshness),
          ),
          SliverList.list(
            children: [
              if (!model.isEmpty)
                WorkFilters(
                  controller: _search,
                  states: [
                    for (final state in laneStatePriority)
                      if ((model.stateCounts[state] ?? 0) > 0 ||
                          state == _state)
                        state,
                  ],
                  stateCounts: model.stateCounts,
                  selectedState: _state,
                  products: model.products,
                  selectedProduct: _product,
                  onQuery: (value) => setState(() => _query = value),
                  onState: (value) => setState(() => _state = value),
                  onProduct: (value) => setState(() => _product = value),
                ),
              ..._body(context, model),
            ],
          ),
        ],
      );
    },
  );

  List<Widget> _body(BuildContext context, MastermindWorkModel model) {
    final l10n = context.l10n;
    return [
      if (model.isEmpty)
        AppGroupedSection.spaced(
          caption: l10n.mastermindLanesLabel,
          children: [
            AppGroupedRow(
              leading: const AppIconTile(icon: LucideIcons.briefcase),
              title: Text(l10n.mastermindWorkEmpty),
            ),
          ],
        )
      else if (model.hasNoMatches)
        AppGroupedSection.spaced(
          children: [
            AppGroupedRow(
              leading: const AppIconTile(icon: LucideIcons.searchX),
              title: Text(l10n.mastermindWorkNoMatches),
            ),
          ],
        ),
      for (final group in model.groups)
        AppGroupedSection.spaced(
          caption: toBeginningOfSentenceCase(
            MastermindLabels.laneState(l10n, group.state),
            l10n.localeName,
          ),
          captionTrailing: Text('${group.lanes.length}'),
          children: [for (final lane in group.lanes) LaneTile(lane: lane)],
        ),
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
    ];
  }
}
