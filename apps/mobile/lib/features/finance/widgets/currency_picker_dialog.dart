import 'package:flutter/material.dart';
import 'package:mobile/core/input/platform_text_context_menu.dart';
import 'package:mobile/core/utils/supported_currencies.dart';
import 'package:mobile/features/finance/widgets/finance_modal_scaffold.dart';
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
    final normalizedInitial = widget.initialCurrencyCode.trim().toLowerCase();
    final filtered = supportedCurrencies
        .where(
          (item) =>
              normalized.isEmpty ||
              item.code.toLowerCase().contains(normalized) ||
              item.name.toLowerCase().contains(normalized),
        )
        .toList(growable: false);

    return FinanceModalScaffold(
      title: l10n.financeWalletSelectCurrency,
      subtitle: l10n.financeCurrencyPickerSubtitle,
      actions: [
        shad.OutlineButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(l10n.commonCancel),
        ),
      ],
      child: Column(
        children: [
          shad.TextField(
            contextMenuBuilder: platformTextContextMenuBuilder(),
            controller: _searchController,
            hintText: l10n.financeWalletSearchCurrency,
            onChanged: (value) => setState(() => _query = value),
            features: const [
              shad.InputFeature.leading(Icon(Icons.search, size: 16)),
            ],
          ),
          const shad.Gap(10),
          Expanded(
            child: ListView.separated(
              itemCount: filtered.length,
              separatorBuilder: (_, _) => const shad.Gap(8),
              itemBuilder: (context, index) {
                final currency = filtered[index];
                final selected =
                    currency.code.toLowerCase() == normalizedInitial;
                return FinancePickerTile(
                  title: currency.code,
                  subtitle: currency.name,
                  isSelected: selected,
                  onTap: () => Navigator.of(context).pop(currency.code),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
