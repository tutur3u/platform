import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/decisions_model.dart';
import 'package:mobile/features/mastermind/presentation/inbox_model.dart';
import 'package:mobile/features/mastermind/presentation/inbox_segment.dart';
import 'package:mobile/features/mastermind/view/inbox/decisions_body.dart';
import 'package:mobile/features/mastermind/view/inbox/inbox_filters.dart';
import 'package:mobile/features/mastermind/view/inbox/inbox_list_body.dart';
import 'package:mobile/features/mastermind/view/inbox/inbox_segment_bar.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_replies_watcher.dart';
import 'package:mobile/features/mastermind/view/inbox/pending_replies_section.dart';
import 'package:mobile/features/mastermind/view/mastermind_freshness_strip.dart';
import 'package:mobile/features/mastermind/view/mastermind_section.dart';
import 'package:mobile/features/mastermind/view/widgets/collapsible_search.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/l10n/l10n.dart';

/// `/mastermind/inbox`: the asks (Needs you, Resolved) and the Decisions
/// journal beside them.
///
/// [initialSegment] is the `?segment=` the location carries (a Home link opens
/// Decisions with it). The segment control changes it and [onSegment] reports
/// each change so the route can keep it in the URL.
///
/// Search starts hidden: the navbar search icon reveals it, and it applies to
/// every ask segment. A pull-down stays a refresh.
class MastermindInboxPage extends StatefulWidget {
  const MastermindInboxPage({
    this.initialSegment = InboxSegment.needsYou,
    this.onSegment,
    super.key,
  });

  final InboxSegment initialSegment;
  final ValueChanged<InboxSegment>? onSegment;

  @override
  State<MastermindInboxPage> createState() => _MastermindInboxPageState();
}

class _MastermindInboxPageState extends State<MastermindInboxPage> {
  final _search = MastermindSearchController();
  String _query = '';
  Product? _product;
  late InboxSegment _segment = widget.initialSegment;
  final Set<String> _expanded = {};
  Product? _decisionProduct;
  bool? _decisionReversible;

  @override
  void didUpdateWidget(MastermindInboxPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Another Home link, or the URL a segment change wrote, while this page is
    // already open.
    if (oldWidget.initialSegment != widget.initialSegment) {
      _segment = widget.initialSegment;
    }
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  void _selectSegment(InboxSegment value) {
    setState(() => _segment = value);
    widget.onSegment?.call(value);
  }

  void _clearFilters() {
    _search.collapse();
    setState(() {
      _query = '';
      _product = null;
    });
  }

  @override
  Widget build(BuildContext context) => MastermindSection(
    builder: (context, ready, freshness) {
      final asks = _segment.listsAsks;
      final list = AppPageScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(
            child: MastermindFreshnessStrip(freshness: freshness),
          ),
          SliverList.list(
            children: [
              if (asks)
                MastermindCollapsibleSearch(
                  controller: _search,
                  placeholder: context.l10n.mastermindInboxSearchPlaceholder,
                  onChanged: (value) => setState(() => _query = value),
                ),
              InboxSegmentBar(selected: _segment, onChanged: _selectSegment),
              if (asks)
                ..._asks(ready.snapshot, freshness.time.add(freshness.age))
              else
                _decisions(ready.snapshot),
            ],
          ),
        ],
      );
      return MastermindRepliesWatcher(
        // The navbar action sits outside the scroll view: a lazy sliver child
        // is disposed once it scrolls away, which would unregister it.
        child: Column(
          children: [
            Expanded(child: list),
            if (asks) _SearchAction(controller: _search),
          ],
        ),
      );
    },
  );

  List<Widget> _asks(MastermindSnapshot snapshot, DateTime now) {
    var model = MastermindInboxModel.from(
      snapshot,
      segment: _segment,
      query: _query,
      product: _product,
    );
    // The chips only exist while two products are present: a filter whose
    // chip is gone could never be cleared and would strand the list.
    if (_product != null &&
        (model.products.length < 2 || !model.products.contains(_product))) {
      _product = null;
      model = MastermindInboxModel.from(
        snapshot,
        segment: _segment,
        query: _query,
      );
    }
    return [
      if (_segment != InboxSegment.resolved) const PendingRepliesSection(),
      if (model.products.length > 1)
        InboxFilters(
          products: model.products,
          selected: _product,
          onProduct: (value) => setState(() => _product = value),
        ),
      InboxListBody(
        model: model,
        expanded: _expanded,
        onExpand: (key) => setState(() => _expanded.add(key)),
        onClearFilters: _clearFilters,
        now: now,
      ),
    ];
  }

  Widget _decisions(MastermindSnapshot snapshot) {
    var model = MastermindDecisionsModel.from(
      snapshot,
      product: _decisionProduct,
      reversible: _decisionReversible,
    );
    // A chip only exists while it can split the journal: a filter whose chip
    // is gone could never be cleared and would strand the list.
    final productGone =
        _decisionProduct != null &&
        (model.products.length < 2 ||
            !model.products.contains(_decisionProduct));
    final reversibleGone =
        _decisionReversible != null && !model.hasReversibleChoice;
    if (productGone || reversibleGone) {
      if (productGone) _decisionProduct = null;
      if (reversibleGone) _decisionReversible = null;
      model = MastermindDecisionsModel.from(
        snapshot,
        product: _decisionProduct,
        reversible: _decisionReversible,
      );
    }
    return DecisionsBody(
      model: model,
      product: _decisionProduct,
      reversible: _decisionReversible,
      onProduct: (value) => setState(() => _decisionProduct = value),
      onReversible: (value) => setState(() => _decisionReversible = value),
    );
  }
}

/// The navbar search icon: opens and focuses the field, or clears and
/// closes it.
class _SearchAction extends StatelessWidget {
  const _SearchAction({required this.controller});

  final MastermindSearchController controller;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: controller,
    builder: (context, _) => ShellChromeActions(
      ownerId: 'mastermind-inbox',
      locations: const {Routes.mastermindInbox},
      actions: [
        controller.searchActionSpec(
          id: 'mastermind-inbox-search',
          tooltip: context.l10n.mastermindInboxSearchAction,
        ),
      ],
    ),
  );
}
