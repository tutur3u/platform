import 'package:flutter/material.dart';
import 'package:mobile/core/utils/currency_formatter.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/l10n/l10n.dart';

/// A loaded sample, grouped by explicit receipt currency, excluding local
/// drafts.
class InventorySalesTotals extends StatelessWidget {
  const InventorySalesTotals({
    required this.sales,
    required this.isPending,
    super.key,
  });

  final List<InventorySaleSummary> sales;
  final bool Function(String) isPending;

  @override
  Widget build(BuildContext context) {
    final totals = <String, double>{};
    var unknown = 0;
    final seen = <String>{};
    for (final sale in sales) {
      if (!seen.add(sale.id) || isPending(sale.id)) continue;
      final currency = sale.currency?.trim().toUpperCase();
      if (currency == null || !RegExp(r'^[A-Z]{3}$').hasMatch(currency)) {
        unknown++;
        continue;
      }
      totals.update(
        currency,
        (n) => n + sale.paidAmount,
        ifAbsent: () => sale.paidAmount,
      );
    }
    return FinancePanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            context.l10n.inventoryRedesignLoadedRevenue,
            style: Theme.of(context).textTheme.titleSmall,
          ),
          const SizedBox(height: 8),
          for (final entry in totals.entries)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                formatCurrency(entry.value, entry.key),
                style: Theme.of(context).textTheme.titleLarge,
              ),
            ),
          if (unknown > 0)
            Text(context.l10n.inventoryRedesignUnknownCurrencies(unknown)),
          Text(context.l10n.inventoryRedesignRecentSample(sales.length)),
        ],
      ),
    );
  }
}
