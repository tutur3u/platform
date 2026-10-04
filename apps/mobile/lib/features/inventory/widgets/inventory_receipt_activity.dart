import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/l10n/l10n.dart';

/// Receipt counts from the bounded recent-sales response, never period revenue.
class InventoryReceiptActivity extends StatefulWidget {
  const InventoryReceiptActivity({required this.sales, this.now, super.key});

  final List<InventoryRecentSale> sales;
  final DateTime? now;

  @override
  State<InventoryReceiptActivity> createState() =>
      _InventoryReceiptActivityState();
}

class _InventoryReceiptActivityState extends State<InventoryReceiptActivity> {
  int _days = 7;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final now = (widget.now ?? DateTime.now()).toLocal();
    final today = DateTime(now.year, now.month, now.day);
    final counts = <DateTime, int>{};
    final seen = <String>{};
    var unknownDates = 0;
    for (final sale in widget.sales) {
      if (!seen.add(sale.id)) continue;
      final date = sale.createdAt?.toLocal();
      if (date == null) {
        unknownDates++;
        continue;
      }
      final day = DateTime(date.year, date.month, date.day);
      if (day.isAfter(today) ||
          day.isBefore(
            DateTime(today.year, today.month, today.day - _days + 1),
          )) {
        continue;
      }
      counts.update(day, (n) => n + 1, ifAbsent: () => 1);
    }
    final entries = counts.entries.toList()
      ..sort((a, b) => a.key.compareTo(b.key));
    final maximum = counts.values.fold<int>(0, math.max);
    return FinancePanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  l10n.inventoryRedesignReceiptActivity,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              Tooltip(
                triggerMode: TooltipTriggerMode.tap,
                message: l10n.inventoryRedesignReceiptCoverage,
                child: const SizedBox(
                  width: 44,
                  height: 44,
                  child: Icon(Icons.info_outline, size: 20),
                ),
              ),
            ],
          ),
          Wrap(
            spacing: 8,
            children: [
              for (final days in [7, 30])
                ChoiceChip(
                  label: Text(l10n.inventoryRedesignDays(days)),
                  selected: _days == days,
                  materialTapTargetSize: MaterialTapTargetSize.padded,
                  onSelected: (_) => setState(() => _days = days),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Text(l10n.inventoryRedesignRecentSample(widget.sales.length)),
          if (unknownDates > 0)
            Text(l10n.inventoryRedesignUnknownDates(unknownDates)),
          if (entries.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Text(l10n.inventorySalesEmpty),
            ),
          for (final entry in entries)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Semantics(
                label:
                    '${DateFormat.yMMMd().format(entry.key)}: ${entry.value}',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(DateFormat.MMMd().format(entry.key)),
                        ),
                        Text('${entry.value}'),
                      ],
                    ),
                    const SizedBox(height: 5),
                    LinearProgressIndicator(
                      value: entry.value / maximum,
                      minHeight: 6,
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
