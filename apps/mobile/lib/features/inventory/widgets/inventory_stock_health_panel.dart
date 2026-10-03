import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/data/models/inventory/inventory_stock_health.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class InventoryStockHealthPanel extends StatelessWidget {
  const InventoryStockHealthPanel({
    required this.future,
    this.retained,
    super.key,
  });

  final Future<InventoryStockHealth>? future;
  final InventoryStockHealth? retained;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return FinancePanel(
      padding: const EdgeInsets.all(14),
      child: FutureBuilder<InventoryStockHealth>(
        future: future,
        builder: (context, snapshot) {
          final data = snapshot.data ?? retained;
          final error = snapshot.error;
          final denied =
              error is ApiException &&
              (error.statusCode == 401 || error.statusCode == 403);
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      l10n.inventoryStockHealthTitle,
                      style: shad.Theme.of(context).typography.h4,
                    ),
                  ),
                  Tooltip(
                    triggerMode: TooltipTriggerMode.tap,
                    message:
                        '${l10n.inventoryStockHealthScope}\n'
                        '${l10n.inventoryStockHealthOverlap}',
                    child: const SizedBox(
                      width: 44,
                      height: 44,
                      child: Icon(Icons.info_outline, size: 20),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              if (snapshot.hasError)
                Text(
                  denied
                      ? l10n.inventoryStockHealthDenied
                      : l10n.inventoryStockHealthUnavailable,
                ),
              if (data == null && !snapshot.hasError)
                Text(l10n.inventoryStockHealthLoading),
              if (data != null && !denied) ...[
                if (data.generatedAt != null)
                  Text(
                    l10n.inventoryStockHealthAsOf(
                      DateFormat(
                        'yyyy-MM-dd HH:mm:ss',
                      ).format(data.generatedAt!.toUtc()),
                    ),
                  ),
                if (!data.isComplete) Text(l10n.inventoryStockHealthIncomplete),
                if (snapshot.connectionState == ConnectionState.waiting)
                  Text(l10n.inventoryStockHealthLoading),
                const SizedBox(height: 10),
                _CountRow(
                  label: l10n.inventoryStockHealthActive,
                  count: data.activeProducts,
                ),
                _CountRow(
                  label: l10n.inventoryStockHealthUnconfigured,
                  count: data.productsWithoutStock,
                ),
                const Divider(height: 20),
                ..._stockBars(context, data),
              ],
            ],
          );
        },
      ),
    );
  }

  List<Widget> _stockBars(BuildContext context, InventoryStockHealth data) {
    final l10n = context.l10n;
    final counts = [
      data.lowStockRows,
      data.outOfStockRows,
      data.unlimitedStockRows,
    ];
    final maximum = counts.whereType<int>().fold<int>(0, math.max);
    return [
      _CountRow(
        label: l10n.inventoryStockHealthLow,
        count: data.lowStockRows,
        maximum: maximum,
      ),
      _CountRow(
        label: l10n.inventoryStockHealthOut,
        count: data.outOfStockRows,
        maximum: maximum,
      ),
      _CountRow(
        label: l10n.inventoryStockHealthUnlimited,
        count: data.unlimitedStockRows,
        maximum: maximum,
      ),
    ];
  }
}

class _CountRow extends StatelessWidget {
  const _CountRow({required this.label, required this.count, this.maximum});

  final String label;
  final int? count;
  final int? maximum;

  @override
  Widget build(BuildContext context) {
    final value = count?.toString() ?? context.l10n.inventoryStockHealthUnknown;
    return Semantics(
      container: true,
      label: '$label: $value',
      excludeSemantics: true,
      child: Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: Text(label)),
                const SizedBox(width: 8),
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 120),
                  child: Text(
                    value,
                    textAlign: TextAlign.right,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
              ],
            ),
            if (maximum != null && count != null) ...[
              const SizedBox(height: 5),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: maximum == 0 ? 0 : count! / maximum!,
                  minHeight: 5,
                  color: shad.Theme.of(context).colorScheme.primary,
                  backgroundColor: shad.Theme.of(context).colorScheme.muted,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
