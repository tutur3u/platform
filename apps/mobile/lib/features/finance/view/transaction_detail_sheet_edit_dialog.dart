part of 'transaction_detail_sheet.dart';

class _TransactionFormDialog extends StatefulWidget {
  const _TransactionFormDialog({
    required this.wsId,
    required this.repository,
    this.transaction,
    this.onSave,
    this.onCreate,
    this.exchangeRates,
    this.initialWalletId,
  }) : assert(
         transaction == null ? onCreate != null : onSave != null,
         'Create mode requires onCreate; edit mode requires onSave.',
       );

  final String wsId;
  final FinanceRepository repository;
  final Transaction? transaction;
  final TransactionSaveHandler? onSave;
  final TransactionCreateHandler? onCreate;
  final List<ExchangeRate>? exchangeRates;
  final String? initialWalletId;

  @override
  State<_TransactionFormDialog> createState() => _TransactionFormDialogState();
}

class _TransactionFormDialogState extends State<_TransactionFormDialog>
    with _TransactionFormDialogStateHelpers {
  void _onAmountChanged() {
    if (!mounted) return;
    _tryAutoFillDestinationAmount();
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final selectedWallet = _selectedWallet;
    final selectedDestinationWallet = _selectedDestinationWallet;
    final selectedCategory = _selectedCategory;
    final selectedTag = _selectedTag;
    final destPlaceholder = '${currencySymbol(_selectedDestinationCurrency)}0';

    return FinanceModalScaffold(
      title: _isCreate
          ? l10n.financeCreateTransaction
          : l10n.financeEditTransaction,
      subtitle: l10n.financeTransactionDialogSubtitle,
      actions: [
        shad.OutlineButton(
          onPressed: _isSaving ? null : () => Navigator.of(context).pop(),
          child: Text(l10n.commonCancel),
        ),
        shad.PrimaryButton(
          onPressed: _isSaving ? null : _handleSave,
          child: _isSaving
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: shad.CircularProgressIndicator(),
                )
              : Text(
                  _isCreate
                      ? (_isTransfer
                            ? l10n.financeTransfer
                            : l10n.financeCreateTransaction)
                      : l10n.timerSave,
                ),
        ),
      ],
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            shad.Tabs(
              index: _tabIndex,
              onChanged: (value) => setState(() => _tabIndex = value),
              children: [
                shad.TabItem(child: Text(l10n.financeTransactionDetails)),
                shad.TabItem(child: Text(l10n.settingsTitle)),
              ],
            ),
            const shad.Gap(16),
            if (_isLoadingOptions)
              const Center(child: NovaLoadingIndicator())
            else ...[
              if (_optionsError != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: Text(
                    _optionsError!,
                    style: theme.typography.small.copyWith(
                      color: theme.colorScheme.destructive,
                    ),
                  ),
                ),
              if (_tabIndex == 0) ...[
                if (_isCreate) ...[
                  _ToggleRow(
                    label: l10n.financeTransferMode,
                    value: _isTransfer,
                    onChanged: (value) {
                      setState(() {
                        _isTransfer = value;
                        if (_isTransfer) {
                          _categoryId = null;
                        } else {
                          _destinationWalletId = null;
                          _destinationAmountController.clear();
                          _isDestinationOverridden = false;
                        }
                      });
                    },
                  ),
                  const shad.Gap(16),
                ],
                _WalletSelectorButton(
                  label: l10n.financeWallet,
                  wallet: selectedWallet,
                  onPressed: _wallets.isEmpty ? null : _pickWallet,
                ),
                const shad.Gap(16),
                if (_isTransfer) ...[
                  _WalletSelectorButton(
                    label: l10n.financeDestinationWallet,
                    wallet: selectedDestinationWallet,
                    placeholder: l10n.financeSelectDestinationWallet,
                    onPressed: _wallets.length < 2
                        ? null
                        : _pickDestinationWallet,
                  ),
                  const shad.Gap(16),
                ] else ...[
                  _CategorySelectorButton(
                    label: l10n.financeCategory,
                    categoryName: selectedCategory?.name,
                    icon: _selectedCategoryIcon,
                    color: _selectedCategoryColor,
                    onPressed: _categories.isEmpty ? null : _pickCategory,
                  ),
                  const shad.Gap(16),
                  _TagSelectorButton(
                    label: l10n.financeTags,
                    tagName: selectedTag?.name,
                    color: _selectedTagColor,
                    onPressed: _tags.isEmpty ? null : _pickTag,
                  ),
                  const shad.Gap(16),
                ],
                if (!_canEditAmountFields)
                  Text(
                    _isTransfer
                        ? l10n.financeSelectWalletAndDestinationFirst
                        : l10n.financeSelectWalletAndCategoryFirst,
                    style: theme.typography.small.copyWith(
                      color: theme.colorScheme.mutedForeground,
                    ),
                  )
                else ...[
                  Text(l10n.financeAmount, style: theme.typography.small),
                  const shad.Gap(4),
                  shad.TextField(
                    key: ValueKey(_selectedCurrency),
                    controller: _amountController,
                    keyboardType: TextInputType.numberWithOptions(
                      decimal: _currencyFractionDigits(_selectedCurrency) > 0,
                    ),
                    inputFormatters: _amountInputFormatters(
                      _selectedCurrency,
                    ),
                    placeholder: Text(
                      '${currencySymbol(_selectedCurrency)}0',
                    ),
                  ),
                  const shad.Gap(6),
                  Text(
                    _amountPreview,
                    style: theme.typography.xSmall.copyWith(
                      color: theme.colorScheme.mutedForeground,
                    ),
                  ),
                  const shad.Gap(16),
                  if (_isTransfer) ...[
                    _TransferDestinationAmountSection(
                      controller: _destinationAmountController,
                      currencyCode: _selectedDestinationCurrency,
                      enabled: !_isAutoMode,
                      previewText: _destinationAmountPreview,
                      isOverridden: _isDestinationOverridden,
                      onToggleOverride: () {
                        setState(() {
                          _isDestinationOverridden = !_isDestinationOverridden;
                        });
                        if (!_isDestinationOverridden) {
                          _tryAutoFillDestinationAmount();
                        }
                      },
                      hintText: _isCrossCurrency
                          ? (_isDestinationOverridden
                                ? l10n.financeDestinationAmountOverrideHint
                                : l10n.financeDestinationAmountAutoHint)
                          : '',
                      inputFormatters: _amountInputFormatters(
                        _selectedDestinationCurrency,
                      ),
                      placeholder: destPlaceholder,
                      allowDecimal:
                          _currencyFractionDigits(
                            _selectedDestinationCurrency,
                          ) >
                          0,
                      exchangeRateDisplay: _exchangeRateDisplay,
                      onInvertRate: () {
                        setState(() => _isRateInverted = !_isRateInverted);
                      },
                      invertRateTooltip: l10n.financeInvertRate,
                      isCrossCurrency: _isCrossCurrency,
                    ),
                    const shad.Gap(16),
                  ],
                  Text(
                    l10n.financeDescription,
                    style: theme.typography.small,
                  ),
                  const shad.Gap(4),
                  shad.TextField(
                    controller: _descriptionController,
                    maxLines: 3,
                    placeholder: Text(l10n.financeDescription),
                  ),
                  const shad.Gap(16),
                ],
                Text(l10n.financeTakenAt, style: theme.typography.small),
                const shad.Gap(4),
                shad.OutlineButton(
                  onPressed: () => _pickDateTime(context),
                  child: Text(DateFormat.yMMMd().add_jm().format(_takenAt)),
                ),
              ] else ...[
                _TransactionFormSettingsTab(
                  reportOptIn: _reportOptIn,
                  onReportOptInChanged: (v) => setState(() => _reportOptIn = v),
                  isTransfer: _isTransfer,
                  isAmountConfidential: _isAmountConfidential,
                  onAmountConfidentialChanged: (v) =>
                      setState(() => _isAmountConfidential = v),
                  isDescriptionConfidential: _isDescriptionConfidential,
                  onDescriptionConfidentialChanged: (v) =>
                      setState(() => _isDescriptionConfidential = v),
                  isCategoryConfidential: _isCategoryConfidential,
                  onCategoryConfidentialChanged: (v) =>
                      setState(() => _isCategoryConfidential = v),
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    _amountController
      ..removeListener(_onAmountChanged)
      ..dispose();
    _destinationAmountController
      ..removeListener(_onAmountChanged)
      ..dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    final amount = widget.transaction?.amount ?? 0;
    _amountController = TextEditingController(
      text: formatInitialAmount(amount.abs()),
    );
    final destinationAmount = widget.transaction?.transfer?.linkedAmount;
    _destinationAmountController = TextEditingController(
      text: destinationAmount == null
          ? ''
          : formatInitialAmount(destinationAmount.abs()),
    );
    _descriptionController = TextEditingController(
      text: widget.transaction?.description ?? '',
    );
    _takenAt =
        widget.transaction?.takenAt ??
        widget.transaction?.createdAt ??
        DateTime.now();
    _walletId = widget.transaction?.walletId ?? widget.initialWalletId;
    _destinationWalletId = widget.transaction?.transfer?.linkedWalletId;
    _categoryId = widget.transaction?.categoryId;
    _tagId = widget.transaction?.tags.firstOrNull?.id;
    _isTransfer = widget.transaction?.isTransfer ?? false;
    _reportOptIn = widget.transaction?.reportOptIn ?? true;
    _isAmountConfidential = widget.transaction?.isAmountConfidential ?? false;
    _isDescriptionConfidential =
        widget.transaction?.isDescriptionConfidential ?? false;
    _isCategoryConfidential =
        widget.transaction?.isCategoryConfidential ?? false;
    // When editing an existing transfer, preserve the stored amounts
    // (override). For new transfers, auto-fill from the exchange rate.
    _isDestinationOverridden = widget.transaction?.isTransfer ?? false;

    _amountController.addListener(_onAmountChanged);
    _destinationAmountController.addListener(_onAmountChanged);

    unawaited(_loadOptions());
  }
}
