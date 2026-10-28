import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/ship_model.dart';
import 'package:mobile/features/mastermind/view/mastermind_freshness_strip.dart';
import 'package:mobile/features/mastermind/view/mastermind_section.dart';
import 'package:mobile/features/mastermind/view/ship/ship_ci_cadence_sections.dart';
import 'package:mobile/features/mastermind/view/ship/ship_delivery_section.dart';
import 'package:mobile/features/mastermind/view/ship/ship_product_group.dart';
import 'package:mobile/features/mastermind/view/ship/ship_untracked_row.dart';
import 'package:mobile/l10n/l10n.dart';

/// `/mastermind/ship`: environments by product (failing ones first, then the
/// most recent release), one "Not tracked yet" row for products with nothing
/// observed, CI now, release cadence, and pull requests and merges.
/// Read-only.
///
/// [initialProduct] is the `?product=` the location carries (a Home row links
/// with it). The chips change it, and [onProduct] reports each change so the
/// route can keep it in the URL.
class MastermindShipPage extends StatefulWidget {
  const MastermindShipPage({this.initialProduct, this.onProduct, super.key});

  final ReleaseProduct? initialProduct;
  final ValueChanged<ReleaseProduct?>? onProduct;

  @override
  State<MastermindShipPage> createState() => _MastermindShipPageState();
}

class _MastermindShipPageState extends State<MastermindShipPage> {
  late ReleaseProduct? _product = widget.initialProduct;

  /// The product reset itself while something was open over this page, so the
  /// URL still names it. It is rewritten once this page is on top again.
  bool _urlStale = false;

  @override
  void didUpdateWidget(MastermindShipPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initialProduct != widget.initialProduct) {
      _product = widget.initialProduct;
    }
  }

  void _select(ReleaseProduct? product) {
    _urlStale = false;
    setState(() => _product = product);
    widget.onProduct?.call(product);
  }

  /// Rewrites the URL once this frame is built, but only while this page is on
  /// top: a rewrite is a `go`, which would drop anything open over the page.
  /// The route being current again rebuilds this and tries once more.
  void _rewriteStaleUrl(BuildContext context) {
    if (!_urlStale || !(ModalRoute.of(context)?.isCurrent ?? true)) return;
    _urlStale = false;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      setState(() => _product = null);
      widget.onProduct?.call(null);
    });
  }

  @override
  Widget build(BuildContext context) => MastermindSection(
    builder: (context, ready, freshness) {
      final snapshot = ready.snapshot;
      var product = _product;
      var model = MastermindShipModel.from(snapshot, product: product);
      // The filter bar only exists while there is a choice: a filter whose
      // pill is gone could never be cleared and would strand the list. This
      // frame shows the unfiltered list; the state and the URL that still
      // name it are cleared after the frame, not during it.
      if (product != null &&
          (model.products.length < 2 || !model.products.contains(product))) {
        product = null;
        model = MastermindShipModel.from(snapshot);
        _urlStale = true;
      }
      _rewriteStaleUrl(context);
      return AppPageScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(
            child: MastermindFreshnessStrip(freshness: freshness),
          ),
          SliverList.list(
            children: [
              if (model.products.length > 1)
                ShipProductFilter(
                  products: model.products,
                  failing: model.failing,
                  selected: product,
                  onSelected: _select,
                ),
              if (model.groups.isEmpty && model.untracked.isEmpty)
                AppGroupedSection.spaced(
                  caption: context.l10n.mastermindEnvironmentsTitle,
                  children: [
                    AppGroupedRow(
                      title: Text(context.l10n.mastermindShipNoEnvironments),
                    ),
                  ],
                ),
              for (final group in model.groups)
                ShipProductGroupSection(
                  group: group,
                  asOf: snapshot.generatedAt,
                ),
              if (model.untracked.isNotEmpty)
                ShipUntrackedRow(groups: model.untracked),
              ShipCiSection(ci: model.ci),
              ShipCadenceSection(
                cadence: model.cadence,
                asOf: snapshot.generatedAt,
              ),
              ShipDeliverySection(delivery: model.delivery),
            ],
          ),
        ],
      );
    },
  );
}
