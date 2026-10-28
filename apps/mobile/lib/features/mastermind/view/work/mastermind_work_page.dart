import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/work_model.dart';
import 'package:mobile/features/mastermind/view/mastermind_freshness_strip.dart';
import 'package:mobile/features/mastermind/view/mastermind_section.dart';
import 'package:mobile/features/mastermind/view/work/work_backlog_section.dart';
import 'package:mobile/features/mastermind/view/work/work_filters.dart';
import 'package:mobile/features/mastermind/view/work/work_lanes_body.dart';
import 'package:mobile/features/mastermind/view/work/work_segment_bar.dart';
import 'package:mobile/features/mastermind/view/work/work_staff_section.dart';

/// The segment and the lane filters, as the Work URL carries them.
typedef WorkSelection = ({
  WorkSegment segment,
  LaneState? state,
  Product? product,
  Area? area,
});

/// `/mastermind/work`: lanes grouped by state, most urgent state first, with
/// the Backlog and Staff segments beside them.
///
/// [initialSegment], [initialState], [initialProduct] and [initialArea] are
/// the `?segment=`, `?state=`, `?product=` and `?area=` the location carries (a
/// Home lane chip links with the state). The segment control and the chips
/// change them, and [onSelection] reports each change so the route can keep
/// them in the URL.
class MastermindWorkPage extends StatefulWidget {
  const MastermindWorkPage({
    this.initialSegment = WorkSegment.lanes,
    this.initialState,
    this.initialProduct,
    this.initialArea,
    this.onSelection,
    super.key,
  });

  final WorkSegment initialSegment;
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
  final _backlogSearch = TextEditingController();
  String _backlogQuery = '';
  late WorkSegment _segment = widget.initialSegment;
  late LaneState? _state = widget.initialState;
  late Product? _product = widget.initialProduct;
  late Area? _area = widget.initialArea;

  /// A filter reset itself while a lane was open over this page, so the URL
  /// still names it. It is rewritten once this page is on top again.
  bool _urlStale = false;

  WorkSelection get _selection =>
      (segment: _segment, state: _state, product: _product, area: _area);

  @override
  void didUpdateWidget(MastermindWorkPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Another Home chip, or the URL a change wrote, while this page is already
    // open.
    if (oldWidget.initialSegment != widget.initialSegment) {
      _segment = widget.initialSegment;
    }
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
    _backlogSearch.dispose();
    super.dispose();
  }

  void _select(VoidCallback change) {
    _urlStale = false;
    setState(change);
    widget.onSelection?.call(_selection);
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

  /// Rewrites the URL once this frame is built, but only while this page is on
  /// top: a rewrite is a `go`, which would drop a lane open over the page. The
  /// route being current again rebuilds this and tries once more.
  void _rewriteStaleUrl(BuildContext context) {
    if (!_urlStale || !(ModalRoute.of(context)?.isCurrent ?? true)) return;
    _urlStale = false;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) widget.onSelection?.call(_selection);
    });
  }

  @override
  Widget build(BuildContext context) => MastermindSection(
    builder: (context, ready, freshness) => AppPageScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        SliverToBoxAdapter(
          child: MastermindFreshnessStrip(freshness: freshness),
        ),
        SliverList.list(
          children: [
            WorkSegmentBar(
              selected: _segment,
              onChanged: (value) => _select(() => _segment = value),
            ),
            ...switch (_segment) {
              WorkSegment.lanes => _lanes(context, ready.snapshot),
              WorkSegment.backlog => [
                WorkBacklogSection(
                  snapshot: ready.snapshot,
                  controller: _backlogSearch,
                  query: _backlogQuery,
                  onQuery: (value) => setState(() => _backlogQuery = value),
                ),
              ],
              WorkSegment.staff => [WorkStaffSection(snapshot: ready.snapshot)],
            },
          ],
        ),
      ],
    ),
  );

  List<Widget> _lanes(BuildContext context, MastermindSnapshot snapshot) {
    var model = _model(snapshot);
    // The product and area chips only exist while two of them are present:
    // a filter whose chip is gone could never be cleared and would strand the
    // list.
    final productGone =
        _product != null &&
        (model.products.length < 2 || !model.products.contains(_product));
    final areaGone =
        _area != null &&
        (model.areas.length < 2 || !model.areas.contains(_area));
    if (productGone || areaGone) {
      if (productGone) _product = null;
      if (areaGone) _area = null;
      model = _model(snapshot);
      // The URL still names the filter that just left, and a later visit to it
      // would bring the filter back.
      _urlStale = true;
    }
    _rewriteStaleUrl(context);
    return [
      if (!model.isEmpty)
        WorkFilters(
          controller: _search,
          states: [
            for (final state in laneStatePriority)
              if ((model.stateCounts[state] ?? 0) > 0 || state == _state) state,
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
      WorkLanesBody(model: model, onClearFilters: _clearFilters),
    ];
  }
}
