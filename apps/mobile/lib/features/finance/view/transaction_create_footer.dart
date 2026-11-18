part of 'transaction_detail_sheet.dart';

extension on _TransactionFormDialogState {
  Widget _buildCreateFooter(BuildContext context) {
    final colors = context.tokens.colorScheme;
    final l10n = context.l10n;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (_isMoneyKeypadVisible) _buildCreateKeypad(context),
        DecoratedBox(
          decoration: BoxDecoration(
            border: Border(top: BorderSide(color: colors.border)),
          ),
          child: SafeArea(
            top: false,
            minimum: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: Center(
              heightFactor: 1,
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 592),
                child: Row(
                  spacing: 12,
                  children: [
                    AppIconButton(
                      icon: const Icon(Icons.attach_file),
                      tooltip: l10n.financeAttachReceipt,
                      variant: AppButtonVariant.outline,
                      shape: AppButtonShape.circle,
                      onPressed: _isSaving ? null : _pickReceipt,
                    ),
                    Expanded(
                      child: AppButton.primary(
                        loading: _isSaving,
                        onPressed: _isSaving ? null : _handleSave,
                        child: Text(l10n.commonSave),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildCreateKeypad(BuildContext context) => TapRegion(
    groupId: _moneyTapRegionGroup,
    onTapOutside: (_) => _dismissMoneyInput(),
    child: Center(
      heightFactor: 1,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 592),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (_moneySuggestions.isNotEmpty)
                _MoneyMultiplierRow(
                  suggestions: _moneySuggestions,
                  onSelected: _applyMoneyMultiplier,
                ),
              _MoneyKeypad(
                decimalSeparator: _localeDecimalSeparator,
                onKeyPressed: _appendMoneyInput,
                onBackspacePressed: _backspaceMoneyInput,
                onClearPressed: _clearMoneyInput,
                onEvaluatePressed: _evaluateMoneyInput,
                onHidePressed: _dismissMoneyInput,
                showsEvaluateAction: _showsMoneyEvaluateAction,
              ),
            ],
          ),
        ),
      ),
    ),
  );
}
