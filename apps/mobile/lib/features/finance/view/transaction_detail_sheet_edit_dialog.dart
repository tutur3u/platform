part of 'transaction_detail_sheet.dart';

enum _MoneyFieldTarget { source, destination }

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
    setState(() {
      _isTransfer = isTransfer;
      if (_isTransfer) {
        _categoryId = null;
        _activeMoneyField = _MoneyFieldTarget.source;
        if (_isCreate && !_hasEditedSettings) {
          _reportOptIn = false;
        }
      } else {
        _destinationWalletId = null;
        _destinationAmountController.clear();
        _isDestinationOverridden = false;
        _activeMoneyField = _MoneyFieldTarget.source;
        if (_isCreate && !_hasEditedSettings) {
          _reportOptIn = true;
        }
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final palette = FinancePalette.of(context);
    final selectedWallet = _displaySelectedWallet;
    final selectedDestinationWallet = _displaySelectedDestinationWallet;
    final selectedCategory = _displaySelectedCategory;
    final selectedTags = _displaySelectedTags;
    final selectedTagLabel = selectedTags.map((tag) => tag.name).join(', ');
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
            style: theme.typography.large.copyWith(fontWeight: FontWeight.w600),
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
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              AnimatedCrossFade(
                duration: const Duration(milliseconds: 320),
                firstCurve: Curves.easeOutCubic,
                secondCurve: Curves.easeOutCubic,
                sizeCurve: Curves.easeInOutCubic,
                crossFadeState: _isMoneyKeypadVisible
                    ? CrossFadeState.showFirst
                    : CrossFadeState.showSecond,
                firstChild: TapRegion(
                  groupId: _moneyTapRegionGroup,
                  onTapOutside: (_) => _dismissMoneyInput(),
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        SizedBox(
                          height: 54,
                          child: AnimatedSwitcher(
                            duration: const Duration(milliseconds: 180),
                            switchInCurve: Curves.easeOutCubic,
                            switchOutCurve: Curves.easeInCubic,
                            transitionBuilder: (child, animation) {
                              final offset = Tween<Offset>(
                                begin: const Offset(0, 0.18),
                                end: Offset.zero,
                              ).animate(animation);
                              return FadeTransition(
                                opacity: animation,
                                child: SlideTransition(
                                  position: offset,
                                  child: child,
                                ),
                              );
                            },
                            child: _moneySuggestions.isNotEmpty
                                ? Padding(
                                    key: const ValueKey('money-suggestions'),
                                    padding: const EdgeInsets.only(bottom: 10),
                                    child: _MoneyMultiplierRow(
                                      suggestions: _moneySuggestions,
                                      onSelected: _applyMoneyMultiplier,
                                    ),
                                  )
                                : const SizedBox.shrink(
                                    key: ValueKey('money-suggestions-empty'),
                                  ),
                          ),
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
                secondChild: Row(
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
          ),
        ),
      ],
      child: SafeArea(
        top: false,
        bottom: false,
        child: NotificationListener<UserScrollNotification>(
          onNotification: (notification) {
            if (_isMoneyKeypadVisible) {
              _dismissMoneyInput();
            }
            return false;
          },
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(16, 6, 16, 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_isCreate) ...[
                  _ModeSelectorCard(
                    isTransfer: _isTransfer,
                    onChanged: _onModeChanged,
                  ),
                  const shad.Gap(12),
                ],
                TapRegion(
                  groupId: _moneyTapRegionGroup,
                  onTapOutside: (_) => _dismissMoneyInput(),
                  child: Focus(
                    focusNode: _sourceAmountFocusNode,
                    child: _PrimaryAmountComposer(
                      surfaceKey: const ValueKey('money-source-surface'),
                      amountLabel: _formattedMoneyFieldLabel(
                        _MoneyFieldTarget.source,
                      ),
                      placeholderLabel: l10n.financeAmount,
                      currencyCode: _selectedCurrency,
                      accentColor: _selectedAmountColor,
                      isFocused: _isMoneyFieldActive(_MoneyFieldTarget.source),
                      onTap: () =>
                          _setActiveMoneyField(_MoneyFieldTarget.source),
                      isTransfer: _isTransfer,
                      walletName: selectedWallet?.name,
                      categoryName: selectedCategory?.name,
                      destinationWalletName: selectedDestinationWallet?.name,
                      tagLabel: selectedTagLabel.trim().isEmpty
                          ? null
                          : selectedTagLabel,
                    ),
                  ),
                ),
                const shad.Gap(12),
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
                        label: _isTransfer
                            ? l10n.financeSourceWallet
                            : l10n.financeWallet,
                        wallet: selectedWallet,
                        isLoading: _isLoadingOptions && _wallets.isEmpty,
                        onPressed: _wallets.isEmpty ? null : _pickWallet,
                      ),
                      const shad.Gap(12),
                      if (_isTransfer)
                        _WalletSelectorButton(
                          label: l10n.financeDestinationWallet,
                          wallet: selectedDestinationWallet,
                          placeholder: '-',
                          isPlaceholder: true,
                          isLoading: _isLoadingOptions && _wallets.isEmpty,
                          onPressed: _wallets.length < 2
                              ? null
                              : _pickDestinationWallet,
                        )
                      else
                        _CategorySelectorButton(
                          label: l10n.financeCategory,
                          categoryName: selectedCategory?.name,
                          icon: _selectedCategoryIcon,
                          color: _selectedCategoryColor,
                          isLoading: _isLoadingOptions && _categories.isEmpty,
                          onPressed: _categories.isEmpty ? null : _pickCategory,
                        ),
                      const shad.Gap(12),
                      _TagSelectorButton(
                        label: l10n.financeTags,
                        tagName: selectedTagLabel.trim().isEmpty
                            ? null
                            : selectedTagLabel,
                        color: _selectedTagColor,
                        isLoading: _isLoadingOptions && _tags.isEmpty,
                        onPressed: _tags.isEmpty ? null : _pickTag,
                      ),
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
                        contextMenuBuilder: platformTextContextMenuBuilder(),
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
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 180),
                    switchInCurve: Curves.easeOutCubic,
                    switchOutCurve: Curves.easeInCubic,
                    child: _showSettings
                        ? _TransactionFormSettingsTab(
                            key: const ValueKey('settings-expanded'),
                            reportOptIn: _reportOptIn,
                            onReportOptInChanged: _setReportOptIn,
                            isTransfer: _isTransfer,
                            isAmountConfidential: _isAmountConfidential,
                            onAmountConfidentialChanged: _setAmountConfidential,
                            isDescriptionConfidential:
                                _isDescriptionConfidential,
                            onDescriptionConfidentialChanged:
                                _setDescriptionConfidential,
                            isCategoryConfidential: _isCategoryConfidential,
                            onCategoryConfidentialChanged:
                                _setCategoryConfidential,
                          )
                        : _TransactionFormSettingsSummary(
                            key: const ValueKey('settings-collapsed'),
                            reportOptIn: _reportOptIn,
                            isTransfer: _isTransfer,
                            isAmountConfidential: _isAmountConfidential,
                            isDescriptionConfidential:
                                _isDescriptionConfidential,
                            isCategoryConfidential: _isCategoryConfidential,
                            onPressed: () =>
                                setState(() => _showSettings = true),
                          ),
                  ),
                ),
              ],
            ),
          ),
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
    _sourceAmountFocusNode.removeListener(_handleMoneyFocusChanged);
    _destinationAmountFocusNode.removeListener(_handleMoneyFocusChanged);
    _sourceAmountFocusNode.dispose();
    _destinationAmountFocusNode.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _workspaceCurrency =
        widget.repository.peekWorkspaceDefaultCurrency(widget.wsId) ?? '';
    final amount = widget.transaction?.amount;
    _amountController = TextEditingController(
      text: amount == null ? '' : formatInitialAmount(amount.abs()),
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
    _sourceAmountFocusNode = FocusNode(debugLabel: 'source-amount');
    _destinationAmountFocusNode = FocusNode(debugLabel: 'destination-amount');
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
    _reportOptIn =
        widget.transaction?.reportOptIn ??
        !(widget.transaction?.isTransfer ?? false);
    _isAmountConfidential = widget.transaction?.isAmountConfidential ?? false;
    _isDescriptionConfidential =
        widget.transaction?.isDescriptionConfidential ?? false;
    _isCategoryConfidential =
        widget.transaction?.isCategoryConfidential ?? false;
    // When editing an existing transfer, preserve the stored amounts
    // (override). For new transfers, auto-fill from the exchange rate.
    _isDestinationOverridden = false;

    _amountController.addListener(_onAmountChanged);
    _destinationAmountController.addListener(_onAmountChanged);
    _sourceAmountFocusNode.addListener(_handleMoneyFocusChanged);
    _destinationAmountFocusNode.addListener(_handleMoneyFocusChanged);

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _setActiveMoneyField(_MoneyFieldTarget.source);
    });
    unawaited(_loadOptions());
  }
}
