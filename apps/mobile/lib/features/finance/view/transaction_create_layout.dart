part of 'transaction_detail_sheet.dart';

extension on _TransactionFormDialogState {
  Widget _buildCreate(BuildContext context) {
    final l10n = context.l10n;
    final tokens = context.tokens;
    final colors = tokens.colorScheme;
    final selectedTags = _displaySelectedTags.map((tag) => tag.name).join(', ');
    final income = _createMode == _CreateTransactionMode.income;
    final currency = _selectedCurrency;
    return PopScope(
      canPop: !_isSaving,
      child: Scaffold(
        backgroundColor: colors.background,
        body: SafeArea(
          bottom: false,
          child: Column(
            children: [
              ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 56),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: Row(
                    children: [
                      AppIconButton(
                        icon: const Icon(Icons.close_rounded),
                        tooltip: l10n.financeCloseTransactionForm,
                        onPressed: _isSaving
                            ? null
                            : () => Navigator.of(context).pop(),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Semantics(
                          header: true,
                          child: Text(
                            l10n.financeNewTransaction,
                            style: tokens.typography.title,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              Expanded(
                child: LayoutBuilder(
                  builder: (context, constraints) => Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 640),
                      child: SingleChildScrollView(
                        padding: EdgeInsets.fromLTRB(
                          AppPageInsets.gutterOf(
                            context,
                            width: constraints.maxWidth,
                          ),
                          12,
                          AppPageInsets.gutterOf(
                            context,
                            width: constraints.maxWidth,
                          ),
                          20,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            AppSegmentedControl(
                              segments: [
                                AppSegment(
                                  value: _CreateTransactionMode.expense,
                                  label: l10n.financeExpense,
                                ),
                                AppSegment(
                                  value: _CreateTransactionMode.income,
                                  label: l10n.financeIncome,
                                ),
                                AppSegment(
                                  value: _CreateTransactionMode.transfer,
                                  label: l10n.financeTransfer,
                                ),
                              ],
                              selected: _createMode,
                              onChanged: _isSaving ? null : _setCreateMode,
                            ),
                            const SizedBox(height: 16),
                            TapRegion(
                              groupId: _moneyTapRegionGroup,
                              onTapOutside: (_) => _dismissMoneyInput(),
                              child: Focus(
                                focusNode: _sourceAmountFocusNode,
                                child: _CreateAmount(
                                  label: l10n.financeAmount,
                                  amount: _createAmountLabel(
                                    _MoneyFieldTarget.source,
                                  ),
                                  currency: currency,
                                  focused: _sourceAmountFocusNode.hasFocus,
                                  onAmount: _isSaving
                                      ? null
                                      : () => _setActiveMoneyField(
                                          _MoneyFieldTarget.source,
                                        ),
                                  onCurrency: _isSaving || _wallets.isEmpty
                                      ? null
                                      : _pickCreateCurrency,
                                ),
                              ),
                            ),
                            const SizedBox(height: 16),
                            if (_optionsError case final error?)
                              _InlineAlertCard(
                                message: error,
                                color: colors.destructive,
                                icon: Icons.error_outline_rounded,
                              ),
                            if (!_isTransfer) ...[
                              _CreateCategoryCard(
                                categories: _categories
                                    .where(
                                      (category) =>
                                          (category.isExpense == false) ==
                                          income,
                                    )
                                    .toList(),
                                selectedId: _categoryId,
                                isLoading: _isLoadingOptions,
                                tone: income
                                    ? FinanceTone.income
                                    : FinanceTone.expense,
                                onChanged: _isSaving
                                    ? null
                                    : _selectCreateCategory,
                              ),
                              const SizedBox(height: 16),
                            ],
                            _buildCreateDetails(context),
                            const SizedBox(height: 16),
                            if (_tags.isNotEmpty) ...[
                              AppCard(
                                padding: EdgeInsets.zero,
                                child: AppGroupedRow(
                                  title: Text(l10n.financeTags),
                                  trailing: _CreateDetailValue(selectedTags),
                                  showChevron: true,
                                  onTap: _isSaving ? null : _pickTag,
                                ),
                              ),
                              const SizedBox(height: 16),
                            ],
                            if (_attachments.isNotEmpty)
                              _TransactionAttachmentPicker(
                                attachments: _attachments,
                                isSaving: _isSaving,
                                onPickAttachments: _pickAttachments,
                                onRemoveAttachment: _removeAttachment,
                              )
                            else
                              Align(
                                alignment: AlignmentDirectional.centerStart,
                                child: AppButton.ghost(
                                  onPressed: _isSaving
                                      ? null
                                      : _pickAttachments,
                                  child: Text(l10n.financeAddAttachments),
                                ),
                              ),
                            if (_showSettings)
                              _TransactionFormSettingsTab(
                                key: const ValueKey('settings-expanded'),
                                reportOptIn: _reportOptIn,
                                onReportOptInChanged: _setReportOptIn,
                                isTransfer: _isTransfer,
                                isAmountConfidential: _isAmountConfidential,
                                onAmountConfidentialChanged:
                                    _setAmountConfidential,
                                isDescriptionConfidential:
                                    _isDescriptionConfidential,
                                onDescriptionConfidentialChanged:
                                    _setDescriptionConfidential,
                                isCategoryConfidential: _isCategoryConfidential,
                                onCategoryConfidentialChanged:
                                    _setCategoryConfidential,
                              )
                            else
                              _TransactionFormSettingsSummary(
                                key: const ValueKey('settings-collapsed'),
                                reportOptIn: _reportOptIn,
                                isTransfer: _isTransfer,
                                isAmountConfidential: _isAmountConfidential,
                                isDescriptionConfidential:
                                    _isDescriptionConfidential,
                                isCategoryConfidential: _isCategoryConfidential,
                                onPressed: _expandSettings,
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              _buildCreateFooter(context),
            ],
          ),
        ),
      ),
    );
  }
}
