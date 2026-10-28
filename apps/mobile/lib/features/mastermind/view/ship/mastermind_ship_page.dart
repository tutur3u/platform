import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/ship_model.dart';
import 'package:mobile/features/mastermind/view/mastermind_freshness_strip.dart';
import 'package:mobile/features/mastermind/view/mastermind_section.dart';
import 'package:mobile/features/mastermind/view/ship/ship_ci_cadence_sections.dart';
import 'package:mobile/features/mastermind/view/ship/ship_delivery_section.dart';
import 'package:mobile/features/mastermind/view/ship/ship_product_group.dart';
import 'package:mobile/l10n/l10n.dart';

/// `/mastermind/ship`: environments by product (failing ones first), CI now,
/// release cadence, and pull requests and merges. Read-only.
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

  @override
  void didUpdateWidget(MastermindShipPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initialProduct != widget.initialProduct) {
      _product = widget.initialProduct;
    }
  }

  void _select(ReleaseProduct? product) {
    setState(() => _product = product);
    widget.onProduct?.call(product);
  }

  @override
  Widget build(BuildContext context) => MastermindSection(
    builder: (context, ready, freshness) {
      final snapshot = ready.snapshot;
      var model = MastermindShipModel.from(snapshot, product: _product);
      // The chips only exist while there is a choice: a filter whose chip is
      // gone could never be cleared and would strand the list. The URL still
      // names it, so it is rewritten once this frame is built.
      if (_product != null &&
          (model.products.length < 2 || !model.products.contains(_product))) {
        _product = null;
        model = MastermindShipModel.from(snapshot);
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) widget.onProduct?.call(null);
        });
      }
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
                  selected: _product,
                  onSelected: _select,
                ),
              if (!model.hasEnvironments && model.groups.isEmpty)
                AppGroupedSection.spaced(
                  caption: context.l10n.mastermindEnvironmentsTitle,
                  children: [
                    AppGroupedRow(
                      title: Text(context.l10n.mastermindShipNoEnvironments),
                    ),
                  ],
                ),
              for (final group in model.groups)
                ShipProductGroupSection(group: group),
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
