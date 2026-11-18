part of 'transaction_detail_sheet.dart';

extension on _TransactionFormDialogState {
  String _createAmountLabel(
    _MoneyFieldTarget target, {
    required bool showAmounts,
  }) {
    final (controller, currency) = switch (target) {
      _MoneyFieldTarget.source => (_amountController, _selectedCurrency),
      _MoneyFieldTarget.destination => (
        _destinationAmountController,
        _selectedDestinationCurrency,
      ),
    };
    if (!showAmounts && !_isMoneyFieldActive(target)) {
      return financeMaskedAmountPlaceholder;
    }
    if (controller.text.trim().isEmpty) return '0';
    final preview = formatAmountExpressionPreview(
      controller.text,
      currencyCode: currency,
      decimalSeparator: _localeDecimalSeparator,
      groupingSeparator: _localeGroupingSeparator,
      locale: Localizations.localeOf(context).toString(),
    );
    final symbol = currencySymbol(currency);
    return preview.startsWith(symbol)
        ? preview.substring(symbol.length)
        : preview;
  }

  Widget _buildCreateDetails(
    BuildContext context, {
    required bool showAmounts,
  }) {
    final l10n = context.l10n;
    final colors = context.tokens.colorScheme;
    final divider = Divider(height: 1, thickness: 1, color: colors.border);
    final destinationAmount = _createAmountLabel(
      _MoneyFieldTarget.destination,
      showAmounts: showAmounts,
    );
    return AppCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          AppGroupedRow(
            title: Text(
              _isTransfer ? l10n.financeSourceWallet : l10n.financeWallet,
            ),
            trailing: _CreateDetailValue(_displaySelectedWallet?.name ?? '—'),
            showChevron: true,
            onTap: _isSaving || _wallets.isEmpty ? null : _pickWallet,
          ),
          if (_isTransfer) ...[
            divider,
            AppGroupedRow(
              title: Text(l10n.financeDestinationWallet),
              trailing: _CreateDetailValue(
                _displaySelectedDestinationWallet?.name ?? '—',
              ),
              showChevron: true,
              onTap: _isSaving || _wallets.length < 2
                  ? null
                  : _pickDestinationWallet,
            ),
            if (_isCrossCurrency) ...[
              divider,
              TapRegion(
                groupId: _moneyTapRegionGroup,
                onTapOutside: (_) => _dismissMoneyInput(),
                child: Focus(
                  focusNode: _destinationAmountFocusNode,
                  child: AppGroupedRow(
                    title: Text(l10n.financeDestinationAmountOptional),
                    trailing: _CreateDetailValue(
                      '$destinationAmount $_selectedDestinationCurrency',
                    ),
                    onTap: _isSaving || !_canEditDestinationAmount
                        ? null
                        : () => _setActiveMoneyField(
                            _MoneyFieldTarget.destination,
                          ),
                  ),
                ),
              ),
            ],
          ],
          divider,
          AppGroupedRow(
            title: Text(l10n.financeTransactionDate),
            trailing: _CreateDetailValue(
              DateFormat.yMMMd(
                Localizations.localeOf(context).toString(),
              ).add_jm().format(_takenAt),
            ),
            showChevron: true,
            onTap: _isSaving ? null : () => _pickDateTime(context),
          ),
          divider,
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                Text(
                  l10n.financeTransactionNote,
                  style: context.tokens.typography.ui,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(minHeight: 52),
                    child: Semantics(
                      label: l10n.financeTransactionNote,
                      child: TextField(
                        controller: _descriptionController,
                        enabled: !_isSaving,
                        textAlign: TextAlign.end,
                        style: context.tokens.typography.body.copyWith(
                          fontSize: 16,
                          color: colors.foreground,
                        ),
                        selectionControls: platformTextSelectionControls(),
                        contextMenuBuilder: platformTextContextMenuBuilder(),
                        decoration: const InputDecoration(
                          border: InputBorder.none,
                          hintText: '—',
                          isCollapsed: true,
                          contentPadding: EdgeInsets.symmetric(vertical: 14),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CreateAmount extends StatelessWidget {
  const _CreateAmount({
    required this.label,
    required this.amount,
    required this.currency,
    required this.focused,
    required this.onAmount,
    required this.onCurrency,
  });

  final String label;
  final String amount;
  final String currency;
  final bool focused;
  final VoidCallback? onAmount;
  final VoidCallback? onCurrency;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final colors = tokens.colorScheme;
    return Column(
      children: [
        Text(
          label,
          style: tokens.typography.caption.copyWith(
            color: colors.mutedForeground,
          ),
        ),
        Semantics(
          button: true,
          label: label,
          focused: focused,
          child: InkWell(
            key: const ValueKey('money-source-surface'),
            borderRadius: tokens.borderRadiusMd,
            onTap: onAmount,
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 48, minWidth: 80),
              child: FittedBox(
                fit: BoxFit.scaleDown,
                child: FinanceMaskedText(
                  context,
                  amount,
                  style: tokens.typography.numeric.copyWith(
                    color: focused ? colors.ring : colors.foreground,
                    fontSize: 40,
                    height: 48 / 40,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          ),
        ),
        if (currency.isNotEmpty)
          AppButton.outline(
            onPressed: onCurrency,
            trailing: const Icon(Icons.expand_more),
            child: Text(currency),
          ),
      ],
    );
  }
}

class _CreateDetailValue extends StatelessWidget {
  const _CreateDetailValue(this.value);

  final String value;

  @override
  Widget build(BuildContext context) => ConstrainedBox(
    constraints: BoxConstraints(
      maxWidth: (MediaQuery.sizeOf(context).width * .4).clamp(0.0, 240.0),
    ),
    child: Text(
      value,
      semanticsLabel: financeAmountSemantics(context, value),
      textAlign: TextAlign.end,
      maxLines: 2,
      overflow: TextOverflow.ellipsis,
    ),
  );
}
