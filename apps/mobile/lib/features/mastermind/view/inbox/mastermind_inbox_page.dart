import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_badge.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/decisions_model.dart';
import 'package:mobile/features/mastermind/presentation/inbox_model.dart';
import 'package:mobile/features/mastermind/presentation/inbox_segment.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/features/mastermind/view/home_needs_you_card.dart';
import 'package:mobile/features/mastermind/view/inbox/decisions_body.dart';
import 'package:mobile/features/mastermind/view/inbox/inbox_filters.dart';
import 'package:mobile/features/mastermind/view/inbox/inbox_item_tile.dart';
import 'package:mobile/features/mastermind/view/inbox/inbox_segment_bar.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_replies_watcher.dart';
import 'package:mobile/features/mastermind/view/inbox/pending_replies_section.dart';
import 'package:mobile/features/mastermind/view/mastermind_freshness_strip.dart';
import 'package:mobile/features/mastermind/view/mastermind_section.dart';
import 'package:mobile/l10n/l10n.dart';

/// `/mastermind/inbox`: the Needs-you list, grouped by kind, with the
/// Decisions journal beside it.
///
/// [initialSegment] is the `?segment=` the location carries (a Home link opens
/// Decisions with it). The segment control changes it and [onSegment] reports
/// each change so the route can keep it in the URL.
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
  final _search = TextEditingController();
  String _query = '';
  Product? _product;
  late InboxSegment _segment = widget.initialSegment;
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

  @override
  Widget build(BuildContext context) => MastermindSection(
    builder: (context, ready, freshness) => MastermindRepliesWatcher(
      child: AppPageScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(
            child: MastermindFreshnessStrip(freshness: freshness),
          ),
          SliverList.list(
            children: [
              InboxSegmentBar(selected: _segment, onChanged: _selectSegment),
              ...switch (_segment) {
                InboxSegment.needsYou => _needsYou(context, ready.snapshot),
                InboxSegment.decisions => [_decisions(ready.snapshot)],
              },
            ],
          ),
        ],
      ),
    ),
  );

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

  List<Widget> _needsYou(BuildContext context, MastermindSnapshot snapshot) {
    var model = MastermindInboxModel.from(
      snapshot,
      query: _query,
      product: _product,
    );
    // The chips only exist while two products are present: a filter whose
    // chip is gone could never be cleared and would strand the list.
    if (_product != null &&
        (model.products.length < 2 || !model.products.contains(_product))) {
      _product = null;
      model = MastermindInboxModel.from(snapshot, query: _query);
    }
    return [
      const PendingRepliesSection(),
      if (!model.isEmpty)
        InboxFilters(
          controller: _search,
          products: model.products,
          selected: _product,
          onQuery: (value) => setState(() => _query = value),
          onProduct: (value) => setState(() => _product = value),
        ),
      ..._body(context, model),
      if (snapshot.resolvedItems.isNotEmpty)
        ExpansionTile(
          title: Text(context.l10n.mastermindRecentlyResolved),
          children: [
            for (final item in snapshot.resolvedItems)
              ListTile(title: Text(item.title), subtitle: Text(item.body)),
          ],
        ),
    ];
  }

  List<Widget> _body(BuildContext context, MastermindInboxModel model) {
    final l10n = context.l10n;
    return [
      if (model.isEmpty)
        AppGroupedSection.spaced(
          caption: l10n.mastermindNeedsYouTitle,
          children: [
            AppGroupedRow(
              leading: const AppIconTile(icon: AppIcons.check),
              title: Text(
                model.security.isEmpty
                    ? l10n.mastermindNothingNeedsYou
                    : l10n.mastermindNothingNeedsReply,
              ),
            ),
          ],
        )
      else if (model.hasNoMatches)
        AppGroupedSection.spaced(
          children: [
            AppGroupedRow(
              leading: const AppIconTile(icon: LucideIcons.searchX),
              title: Text(l10n.mastermindInboxNoMatches),
            ),
          ],
        ),
      for (final group in model.groups)
        AppGroupedSection.spaced(
          caption: _groupTitle(l10n, group.kind),
          captionTrailing: Text('${group.items.length}'),
          children: [for (final item in group.items) InboxItemTile(item: item)],
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

  static String _groupTitle(AppLocalizations l10n, ItemKind? kind) =>
      switch (kind) {
        ItemKind.decision => l10n.mastermindGroupDecisions,
        ItemKind.action => l10n.mastermindGroupActions,
        ItemKind.fyi => l10n.mastermindGroupFyi,
        null => l10n.mastermindNeedsYouTitle,
      };
}
