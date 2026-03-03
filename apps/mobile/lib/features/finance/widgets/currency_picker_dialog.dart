import 'package:flutter/material.dart';
import 'package:mobile/core/utils/supported_currencies.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class CurrencyPickerDialog extends StatefulWidget {
  const CurrencyPickerDialog({required this.initialCurrencyCode, super.key});

  final String initialCurrencyCode;

  @override
  State<CurrencyPickerDialog> createState() => _CurrencyPickerDialogState();
}

class _CurrencyPickerDialogState extends State<CurrencyPickerDialog> {
  final _searchController = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final normalized = _query.trim().toLowerCase();
    final filtered = supportedCurrencies
        .where(
          (item) =>
              normalized.isEmpty ||
              item.code.toLowerCase().contains(normalized) ||
              item.name.toLowerCase().contains(normalized),
        )
        .toList(growable: false);

    return shad.AlertDialog(
      title: Text(l10n.financeWalletSelectCurrency),
      content: SizedBox(
        width: double.maxFinite,
        height: 420,
        child: Column(
          children: [
            shad.TextField(
              controller: _searchController,
              hintText: l10n.financeWalletSearchCurrency,
              onChanged: (value) => setState(() => _query = value),
              features: const [
                shad.InputFeature.leading(Icon(Icons.search, size: 16)),
              ],
            ),
            const shad.Gap(8),
            Expanded(
              child: ListView.separated(
                itemCount: filtered.length,
                separatorBuilder: (_, _) => const shad.Gap(4),
                itemBuilder: (context, index) {
                  final currency = filtered[index];
                  final selected = currency.code == widget.initialCurrencyCode;
                  final child = Align(
                    alignment: Alignment.centerLeft,
                    child: Text('${currency.code} - ${currency.name}'),
                  );
                  if (selected) {
                    return shad.PrimaryButton(
                      onPressed: () => Navigator.of(context).pop(currency.code),
                      child: child,
                    );
                  }
                  return shad.GhostButton(
                    onPressed: () => Navigator.of(context).pop(currency.code),
                    child: child,
                  );
                },
              ),
            ),
          ],
        ),
      ),
      actions: [
        shad.OutlineButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(l10n.commonCancel),
        ),
      ],
    );
  }
}
