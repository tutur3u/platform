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

/// The state, product and area filters, as the Work URL carries them.
typedef WorkSelection = ({LaneState? state, Product? product, Area? area});

/// `/mastermind/work`: lanes grouped by state, most urgent state first.
///
/// [initialState], [initialProduct] and [initialArea] are the `?state=`,
/// `?product=` and `?area=` filters the location carries (a Home lane chip
/// links with the state). The chips below change them, and [onSelection]
/// reports each change so the route can keep them in the URL.
class MastermindWorkPage extends StatefulWidget {
  const MastermindWorkPage({
    this.initialState,
    this.initialProduct,
    this.initialArea,
    this.onSelection,
    super.key,
  });

  final LaneState? initialState;
  final Product? initialProduct;
  final Area? initialArea;
  final ValueChanged<WorkSelection>? onSelection;

  @override
  State<MastermindWorkPage> createState() => _MastermindWorkPageState();
}

class _MastermindWorkPageState extends State<MastermindWorkPage> {
  final _search = TextEditingController();
  String _query = '';
  late LaneState? _state = widget.initialState;
  late Product? _product = widget.initialProduct;
  late Area? _area = widget.initialArea;

  @override
  void didUpdateWidget(MastermindWorkPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Another Home chip, or the URL a filter change wrote, while this page is
    // already open.
    if (oldWidget.initialState != widget.initialState) {
      _state = widget.initialState;
    }
    if (oldWidget.initialProduct != widget.initialProduct) {
      _product = widget.initialProduct;
    }
    if (oldWidget.initialArea != widget.initialArea) {
      _area = widget.initialArea;
    }
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  void _select(VoidCallback change) {
    setState(change);
    widget.onSelection?.call((state: _state, product: _product, area: _area));
  }

  void _clearFilters() {
    _search.clear();
    _query = '';
    _select(() {
      _state = null;
      _product = null;
      _area = null;
    });
  }

  MastermindWorkModel _model(MastermindSnapshot snapshot) =>
      MastermindWorkModel.from(
        snapshot,
        query: _query,
        state: _state,
        product: _product,
        area: _area,
      );

  @override
  Widget build(BuildContext context) => MastermindSection(
    builder: (context, ready, freshness) {
      var model = _model(ready.snapshot);
      // The product and area chips only exist while two of them are present:
      // a filter whose chip is gone could never be cleared and would strand
      // the list.
      final productGone =
          _product != null &&
          (model.products.length < 2 || !model.products.contains(_product));
      final areaGone =
          _area != null &&
          (model.areas.length < 2 || !model.areas.contains(_area));
      if (productGone || areaGone) {
        if (productGone) _product = null;
        if (areaGone) _area = null;
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
                  areas: model.areas,
                  selectedArea: _area,
                  onQuery: (value) => setState(() => _query = value),
                  onState: (value) => _select(() => _state = value),
                  onProduct: (value) => _select(() => _product = value),
                  onArea: (value) => _select(() => _area = value),
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
            AppGroupedRow(
              leading: const AppIconTile(icon: LucideIcons.filterX),
              title: Text(l10n.mastermindWorkClearFilters),
              onTap: _clearFilters,
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
