import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/features/inventory/controllers/inventory_season_pricing_controller.dart';
import 'package:mobile/l10n/l10n.dart';

/// Compact quote provenance and explicit fail-closed/retry state.
class InventorySeasonPriceStatus extends StatelessWidget {
  const InventorySeasonPriceStatus({required this.controller, super.key});
  final InventorySeasonPricingController controller;
  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final period = controller.period;
    final quote = controller.quote;
    final provenance = quote == null
        ? ''
        : l10n.inventorySeasonPriceAsOf(
            controller.currency,
            DateFormat('yyyy-MM-dd HH:mm:ss').format(quote.asOf),
            period?.timeZone ?? '',
          );
    final text = controller.hasPending
        ? l10n.inventorySeasonRetryPending
        : controller.loading
        ? l10n.inventorySeasonPriceLoading
        : controller.ready
        ? provenance
        : l10n.inventorySeasonPriceUnavailable;
    return Semantics(
      liveRegion: true,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(period?.name ?? '')),
                if (!controller.hasPending)
                  IconButton(
                    tooltip: l10n.commonRefresh,
                    onPressed: controller.loading ? null : controller.refresh,
                    icon: const Icon(Icons.refresh_rounded, size: 20),
                  ),
              ],
            ),
            Text(text),
            if (controller.hasPending && provenance.isNotEmpty)
              Text(provenance),
          ],
        ),
      ),
    );
  }
}

/// Explicit currency code, with ISO currency precision (including 0/3 decimals).
String formatSeasonPrice(double value, String currency) =>
    NumberFormat.currency(name: currency, symbol: '$currency ').format(value);
