import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_badge.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/inbox_model.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/features/mastermind/view/home_needs_you_card.dart';
import 'package:mobile/features/mastermind/view/inbox/inbox_filters.dart';
import 'package:mobile/features/mastermind/view/inbox/inbox_item_tile.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_replies_watcher.dart';
import 'package:mobile/features/mastermind/view/inbox/pending_replies_section.dart';
import 'package:mobile/features/mastermind/view/mastermind_freshness_strip.dart';
import 'package:mobile/features/mastermind/view/mastermind_section.dart';
import 'package:mobile/l10n/l10n.dart';

/// `/mastermind/inbox`: the Needs-you list, grouped by kind.
class MastermindInboxPage extends StatefulWidget {
  const MastermindInboxPage({super.key});

  @override
  State<MastermindInboxPage> createState() => _MastermindInboxPageState();
}

class _MastermindInboxPageState extends State<MastermindInboxPage> {
  final _search = TextEditingController();
  String _query = '';
  Product? _product;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MastermindSection(
    builder: (context, ready, freshness) {
      var model = MastermindInboxModel.from(
        ready.snapshot,
        query: _query,
        product: _product,
      );
      // The chips only exist while two products are present: a filter whose
      // chip is gone could never be cleared and would strand the list.
      if (_product != null &&
          (model.products.length < 2 || !model.products.contains(_product))) {
        _product = null;
        model = MastermindInboxModel.from(ready.snapshot, query: _query);
      }
      return MastermindRepliesWatcher(
        child: AppPageScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(
              child: MastermindFreshnessStrip(freshness: freshness),
            ),
            SliverList.list(
              children: [
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
              ],
            ),
          ],
        ),
      );
    },
  );

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
