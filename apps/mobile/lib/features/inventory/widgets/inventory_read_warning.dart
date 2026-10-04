import 'package:flutter/material.dart';
import 'package:mobile/l10n/l10n.dart';

/// Keeps the last scoped snapshot visible when a provider cannot refresh it.
class InventoryReadWarning extends StatelessWidget {
  const InventoryReadWarning({required this.onRetry, super.key});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.only(top: 12),
          child: Icon(Icons.cloud_off_outlined, size: 20),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Text(context.l10n.inventoryRedesignLimitedData),
          ),
        ),
        TextButton(onPressed: onRetry, child: Text(context.l10n.commonRetry)),
      ],
    ),
  );
}
