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

  void _onModeChanged(bool isTransfer) {
    final canSwitchMode = _isCreate || widget.transaction?.isTransfer == true;
    if (!canSwitchMode && isTransfer) {
      return;
    }

    setState(() {
      _isTransfer = isTransfer;
      if (_isTransfer) {
        _categoryId = null;
      } else {
        _destinationWalletId = null;
        _destinationAmountController.clear();
        _isDestinationOverridden = false;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final palette = FinancePalette.of(context);
    final selectedWallet = _selectedWallet;
    final selectedDestinationWallet = _selectedDestinationWallet;
    final selectedCategory = _selectedCategory;
    final selectedTags = _selectedTags;
    final selectedTagLabel = selectedTags.map((tag) => tag.name).join(', ');
    final canSwitchMode = _isCreate || widget.transaction?.isTransfer == true;
    final destPlaceholder = '${currencySymbol(_selectedDestinationCurrency)}0';
    final destinationHintText = _isCrossCurrency
        ? (_isDestinationOverridden
              ? l10n.financeDestinationAmountOverrideHint
              : l10n.financeDestinationAmountAutoHint)
        : '';
    final hasSelectedCategoryName =
        selectedCategory?.name != null &&
        selectedCategory!.name!.trim().isNotEmpty;
    final hasSelectedWalletName =
        selectedWallet?.name != null && selectedWallet!.name!.trim().isNotEmpty;
    final draftTitle = _isTransfer
        ? _transferDraftTitle(l10n)
        : (_descriptionController.text.trim().isNotEmpty
              ? _descriptionController.text.trim()
              : hasSelectedCategoryName
              ? selectedCategory.name!.trim()
              : l10n.financeCreateTransaction);
    final draftSubtitle = _isTransfer
        ? _transferDraftSubtitle()
        : [
            if (hasSelectedWalletName) selectedWallet.name!.trim(),
            if (hasSelectedCategoryName) selectedCategory.name!.trim(),
            DateFormat.MMMd().add_jm().format(_takenAt),
          ].join(' • ');
    final previewAmountLabel = _isTransfer
        ? (_destinationAmountController.text.trim().isNotEmpty
              ? _destinationAmountPreview
              : _amountPreview)
        : _amountPreview;
    final actionLabel = _isCreate
        ? (_isTransfer ? l10n.financeTransfer : l10n.financeCreateTransaction)
        : l10n.timerSave;

    return shad.Scaffold(
      headers: [
        shad.AppBar(
          title: Text(
            _isCreate
                ? l10n.financeCreateTransaction
                : l10n.financeEditTransaction,
          ),
          trailing: [
            shad.GhostButton(
              onPressed: _isSaving ? null : () => Navigator.of(context).pop(),
              child: const Icon(Icons.close_rounded, size: 18),
            ),
          ],
        ),
      ],
      footers: [
        AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOut,
          padding: EdgeInsets.fromLTRB(
            16,
            12,
            16,
            16 +
                MediaQuery.paddingOf(context).bottom +
                MediaQuery.viewInsetsOf(context).bottom,
          ),
          decoration: BoxDecoration(
            color: palette.panel,
            border: Border(
              top: BorderSide(
                color: theme.colorScheme.border.withValues(alpha: 0.72),
              ),
            ),
          ),
          child: Row(
            children: [
              Expanded(
                child: shad.OutlineButton(
                  onPressed: _isSaving
                      ? null
                      : () => Navigator.of(context).pop(),
                  child: Center(
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text(l10n.commonCancel, maxLines: 1),
                    ),
                  ),
                ),
              ),
              const shad.Gap(12),
              Expanded(
                child: shad.PrimaryButton(
                  onPressed: _isSaving ? null : _handleSave,
                  child: _isSaving
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: shad.CircularProgressIndicator(),
                        )
                      : Center(
                          child: FittedBox(
                            fit: BoxFit.scaleDown,
                            child: Text(actionLabel, maxLines: 1),
                          ),
                        ),
                ),
              ),
            ],
          ),
        ),
      ],
      child: SafeArea(
        top: false,
        bottom: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 6, 16, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _ModeSelectorCard(
                isTransfer: _isTransfer,
                canSwitchMode: canSwitchMode,
                onChanged: _onModeChanged,
              ),
              const shad.Gap(12),
              _DraftPreviewCard(
                title: draftTitle,
                subtitle: draftSubtitle,
                amountLabel: previewAmountLabel,
                accentColor: _isTransfer
                    ? theme.colorScheme.primary
                    : _selectedCategoryColor,
                isTransfer: _isTransfer,
                walletName: selectedWallet?.name,
                categoryName: selectedCategory?.name,
                destinationWalletName: selectedDestinationWallet?.name,
                tagLabel: selectedTagLabel.trim().isEmpty
                    ? null
                    : selectedTagLabel,
              ),
              const shad.Gap(12),
              if (_isLoadingOptions)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: Center(child: NovaLoadingIndicator()),
                )
              else ...[
                if (_optionsError != null)
                  _InlineAlertCard(
                    message: _optionsError!,
                    color: theme.colorScheme.destructive,
                    icon: Icons.error_outline_rounded,
                  ),
                if (_optionsError != null) const shad.Gap(12),
                _FormSectionCard(
                  title: _isTransfer
                      ? l10n.financeTransfer
                      : l10n.financeTransactionDetails,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _WalletSelectorButton(
                        label: l10n.financeWallet,
                        wallet: selectedWallet,
                        onPressed: _wallets.isEmpty ? null : _pickWallet,
                      ),
                      const shad.Gap(12),
                      if (_isTransfer)
                        _WalletSelectorButton(
                          label: l10n.financeDestinationWallet,
                          wallet: selectedDestinationWallet,
                          placeholder: l10n.financeSelectDestinationWallet,
                          onPressed: _wallets.length < 2
                              ? null
                              : _pickDestinationWallet,
                        )
                      else ...[
                        _CategorySelectorButton(
                          label: l10n.financeCategory,
                          categoryName: selectedCategory?.name,
                          icon: _selectedCategoryIcon,
                          color: _selectedCategoryColor,
                          onPressed: _categories.isEmpty ? null : _pickCategory,
                        ),
                        const shad.Gap(12),
                        _TagSelectorButton(
                          label: l10n.financeTags,
                          tagName: selectedTagLabel.trim().isEmpty
                              ? null
                              : selectedTagLabel,
                          color: _selectedTagColor,
                          onPressed: _tags.isEmpty ? null : _pickTag,
                        ),
                      ],
                    ],
                  ),
                ),
                const shad.Gap(12),
                _FormSectionCard(
                  title: l10n.financeAmount,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _AmountEntryCard(
                        label: l10n.financeAmount,
                        controller: _amountController,
                        currencyCode: _selectedCurrency,
                        placeholder: '${currencySymbol(_selectedCurrency)}0',
                        allowDecimal:
                            _currencyFractionDigits(_selectedCurrency) > 0,
                        inputFormatters: _amountInputFormatters(
                          _selectedCurrency,
                        ),
                        previewText: _amountPreview,
                        onChanged: (_) => _onAmountChanged(),
                      ),
                      if (_isTransfer) ...[
                        const shad.Gap(10),
                        _TransferDestinationAmountSection(
                          controller: _destinationAmountController,
                          currencyCode: _selectedDestinationCurrency,
                          enabled: _destinationWalletId != null && !_isAutoMode,
                          previewText: _destinationAmountPreview,
                          isOverridden: _isDestinationOverridden,
                          onToggleOverride: () {
                            setState(() {
                              _isDestinationOverridden =
                                  !_isDestinationOverridden;
                            });
                            if (!_isDestinationOverridden) {
                              _tryAutoFillDestinationAmount();
                            }
                          },
                          hintText: _destinationWalletId == null
                              ? l10n.financeSelectDestinationWallet
                              : destinationHintText,
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
                            setState(
                              () => _isRateInverted = !_isRateInverted,
                            );
                          },
                          invertRateTooltip: l10n.financeInvertRate,
                          isCrossCurrency: _isCrossCurrency,
                        ),
                      ],
                    ],
                  ),
                ),
                const shad.Gap(12),
                _FormSectionCard(
                  title: l10n.financeDescription,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      shad.TextField(
                        controller: _descriptionController,
                        maxLines: 4,
                        placeholder: Text(l10n.financeDescription),
                        onChanged: (_) => setState(() {}),
                      ),
                      const shad.Gap(12),
                      _DatePickerCard(
                        label: l10n.financeTakenAt,
                        value: DateFormat.yMMMd().add_jm().format(_takenAt),
                        onPressed: () => _pickDateTime(context),
                      ),
                    ],
                  ),
                ),
                const shad.Gap(12),
                _FormSectionCard(
                  title: l10n.settingsTitle,
                  child: _TransactionFormSettingsTab(
                    reportOptIn: _reportOptIn,
                    onReportOptInChanged: (v) =>
                        setState(() => _reportOptIn = v),
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
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  String _transferDraftTitle(AppLocalizations l10n) {
    final from = _selectedWallet?.name?.trim();
    final to = _selectedDestinationWallet?.name?.trim();
    if ((from?.isNotEmpty ?? false) && (to?.isNotEmpty ?? false)) {
      return '$from → $to';
    }
    return l10n.financeTransfer;
  }

  String _transferDraftSubtitle() {
    final parts = <String>[
      if (_selectedWallet?.currency != null &&
          _selectedWallet!.currency!.trim().isNotEmpty)
        _selectedWallet!.currency!.trim().toUpperCase(),
      if (_selectedDestinationWallet?.currency != null &&
          _selectedDestinationWallet!.currency!.trim().isNotEmpty)
        _selectedDestinationWallet!.currency!.trim().toUpperCase(),
      DateFormat.MMMd().add_jm().format(_takenAt),
    ];
    return parts.join(' • ');
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
    _tagIds =
        widget.transaction?.tags
            .map((tag) => tag.id)
            .toList(
              growable: false,
            ) ??
        const [];
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
