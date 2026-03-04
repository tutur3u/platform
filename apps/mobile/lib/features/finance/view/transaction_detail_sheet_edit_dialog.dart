part of 'transaction_detail_sheet.dart';

class _TransactionFormDialog extends StatefulWidget {
  const _TransactionFormDialog({
    required this.wsId,
    required this.repository,
    this.transaction,
    this.onSave,
    this.onCreate,
  }) : assert(
         transaction == null ? onCreate != null : onSave != null,
         'Create mode requires onCreate; edit mode requires onSave.',
       );

  final String wsId;
  final FinanceRepository repository;
  final Transaction? transaction;
  final TransactionSaveHandler? onSave;
  final TransactionCreateHandler? onCreate;

  @override
  State<_TransactionFormDialog> createState() => _TransactionFormDialogState();
}

class _TransactionFormDialogState extends State<_TransactionFormDialog> {
  late final TextEditingController _amountController;
  late final TextEditingController _destinationAmountController;
  late final TextEditingController _descriptionController;
  late DateTime _takenAt;

  List<Wallet> _wallets = const [];
  List<TransactionCategory> _categories = const [];
  String? _walletId;
  String? _destinationWalletId;
  String? _categoryId;
  bool _isTransfer = false;
  bool _reportOptIn = true;
  bool _isAmountConfidential = false;
  bool _isDescriptionConfidential = false;
  bool _isCategoryConfidential = false;
  int _tabIndex = 0;

  bool _isLoadingOptions = false;
  String? _optionsError;
  bool _isSaving = false;

  bool get _isCreate => widget.transaction == null;

  void _onAmountChanged() {
    if (!mounted) return;
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final selectedWallet = _selectedWallet;
    final selectedDestinationWallet = _selectedDestinationWallet;
    final selectedCategory = _selectedCategory;

    return shad.AlertDialog(
      title: Text(
        _isCreate ? l10n.financeCreateTransaction : l10n.financeEditTransaction,
      ),
      content: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.65,
        ),
        child: SizedBox(
          width: double.maxFinite,
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
                  const Center(child: shad.CircularProgressIndicator())
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
                            }
                          });
                        },
                      ),
                      const shad.Gap(16),
                    ],
                    Text(l10n.financeWallet, style: theme.typography.small),
                    const shad.Gap(4),
                    shad.OutlineButton(
                      onPressed: _wallets.isEmpty ? null : _pickWallet,
                      child: Row(
                        children: [
                          WalletVisualAvatar(
                            icon: selectedWallet?.icon,
                            imageSrc: selectedWallet?.imageSrc,
                            fallbackIcon: Icons.wallet_outlined,
                            size: 28,
                          ),
                          const shad.Gap(8),
                          Expanded(
                            child: Text(
                              selectedWallet?.name ?? '-',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          const Icon(Icons.expand_more, size: 16),
                        ],
                      ),
                    ),
                    const shad.Gap(16),
                    if (_isTransfer) ...[
                      Text(
                        l10n.financeDestinationWallet,
                        style: theme.typography.small,
                      ),
                      const shad.Gap(4),
                      shad.OutlineButton(
                        onPressed: _wallets.length < 2
                            ? null
                            : _pickDestinationWallet,
                        child: Row(
                          children: [
                            WalletVisualAvatar(
                              icon: selectedDestinationWallet?.icon,
                              imageSrc: selectedDestinationWallet?.imageSrc,
                              fallbackIcon: Icons.wallet_outlined,
                              size: 28,
                            ),
                            const shad.Gap(8),
                            Expanded(
                              child: Text(
                                selectedDestinationWallet?.name ??
                                    l10n.financeSelectDestinationWallet,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            const Icon(Icons.expand_more, size: 16),
                          ],
                        ),
                      ),
                      const shad.Gap(16),
                    ] else ...[
                      Text(l10n.financeCategory, style: theme.typography.small),
                      const shad.Gap(4),
                      shad.OutlineButton(
                        onPressed: _categories.isEmpty ? null : _pickCategory,
                        child: Row(
                          children: [
                            Container(
                              width: 24,
                              height: 24,
                              decoration: BoxDecoration(
                                color: _selectedCategoryColor.withValues(
                                  alpha: 0.16,
                                ),
                                shape: BoxShape.circle,
                              ),
                              child: Icon(
                                _selectedCategoryIcon,
                                size: 13,
                                color: _selectedCategoryColor,
                              ),
                            ),
                            const shad.Gap(8),
                            Expanded(
                              child: Text(
                                selectedCategory?.name ?? '-',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            const Icon(Icons.expand_more, size: 16),
                          ],
                        ),
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
                          decimal:
                              _currencyFractionDigits(_selectedCurrency) > 0,
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
                        Text(
                          l10n.financeDestinationAmountOptional,
                          style: theme.typography.small,
                        ),
                        const shad.Gap(4),
                        shad.TextField(
                          key: ValueKey(_selectedDestinationCurrency),
                          controller: _destinationAmountController,
                          keyboardType: TextInputType.numberWithOptions(
                            decimal:
                                _currencyFractionDigits(
                                  _selectedDestinationCurrency,
                                ) >
                                0,
                          ),
                          inputFormatters: _amountInputFormatters(
                            _selectedDestinationCurrency,
                          ),
                          placeholder: Text(
                            '${currencySymbol(_selectedDestinationCurrency)}0',
                          ),
                        ),
                        const shad.Gap(6),
                        Text(
                          _destinationAmountPreview,
                          style: theme.typography.xSmall.copyWith(
                            color: theme.colorScheme.mutedForeground,
                          ),
                        ),
                        if (_isCrossCurrency &&
                            _exchangeRatePreview.isNotEmpty) ...[
                          const shad.Gap(6),
                          Row(
                            children: [
                              Icon(
                                Icons.currency_exchange,
                                size: 13,
                                color: theme.colorScheme.mutedForeground,
                              ),
                              const shad.Gap(4),
                              Text(
                                _exchangeRatePreview,
                                style: theme.typography.xSmall.copyWith(
                                  color: theme.colorScheme.mutedForeground,
                                ),
                              ),
                            ],
                          ),
                        ],
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
                    _ToggleRow(
                      label: l10n.financeReportOptIn,
                      value: _reportOptIn,
                      onChanged: (value) {
                        setState(() => _reportOptIn = value);
                      },
                    ),
                    if (!_isTransfer) ...[
                      const shad.Gap(12),
                      _ToggleRow(
                        label: l10n.financeConfidentialAmount,
                        value: _isAmountConfidential,
                        onChanged: (value) {
                          setState(() => _isAmountConfidential = value);
                        },
                      ),
                      const shad.Gap(12),
                      _ToggleRow(
                        label: l10n.financeConfidentialDescription,
                        value: _isDescriptionConfidential,
                        onChanged: (value) {
                          setState(() => _isDescriptionConfidential = value);
                        },
                      ),
                      const shad.Gap(12),
                      _ToggleRow(
                        label: l10n.financeConfidentialCategory,
                        value: _isCategoryConfidential,
                        onChanged: (value) {
                          setState(() => _isCategoryConfidential = value);
                        },
                      ),
                    ],
                  ],
                ],
              ],
            ),
          ),
        ),
      ),
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
      text: _formatInitialAmount(amount.abs()),
    );
    final destinationAmount = widget.transaction?.transfer?.linkedAmount;
    _destinationAmountController = TextEditingController(
      text: destinationAmount == null
          ? ''
          : _formatInitialAmount(destinationAmount.abs()),
    );
    _descriptionController = TextEditingController(
      text: widget.transaction?.description ?? '',
    );
    _takenAt =
        widget.transaction?.takenAt ??
        widget.transaction?.createdAt ??
        DateTime.now();
    _walletId = widget.transaction?.walletId;
    _destinationWalletId = widget.transaction?.transfer?.linkedWalletId;
    _categoryId = widget.transaction?.categoryId;
    _isTransfer = widget.transaction?.isTransfer ?? false;
    _reportOptIn = widget.transaction?.reportOptIn ?? true;
    _isAmountConfidential = widget.transaction?.isAmountConfidential ?? false;
    _isDescriptionConfidential =
        widget.transaction?.isDescriptionConfidential ?? false;
    _isCategoryConfidential =
        widget.transaction?.isCategoryConfidential ?? false;

    _amountController.addListener(_onAmountChanged);
    _destinationAmountController.addListener(_onAmountChanged);

    unawaited(_loadOptions());
  }

  Future<void> _loadOptions() async {
    setState(() {
      _isLoadingOptions = true;
      _optionsError = null;
    });

    try {
      final wallets = await widget.repository.getWallets(widget.wsId);
      final categories = await widget.repository.getCategories(widget.wsId);

      if (!mounted) return;
      setState(() {
        _wallets = wallets;
        _categories = categories;
        _reconcileSelectedIds();
      });
    } on Exception {
      if (!mounted) return;
      setState(() => _optionsError = context.l10n.commonSomethingWentWrong);
    } finally {
      if (mounted) {
        setState(() => _isLoadingOptions = false);
      }
    }
  }

  Future<void> _handleSave() async {
    final l10n = context.l10n;
    _reconcileSelectedIds();
    final amount = _parseAmount(_amountController.text);
    if (_isTransfer) {
      if (_walletId == null || _destinationWalletId == null) {
        shad.showToast(
          context: context,
          builder: (ctx, overlay) => shad.Alert.destructive(
            content: Text(ctx.l10n.financeSelectWalletAndDestinationFirst),
          ),
        );
        return;
      }

      if (_walletId == _destinationWalletId) {
        shad.showToast(
          context: context,
          builder: (ctx, overlay) => shad.Alert.destructive(
            content: Text(ctx.l10n.financeWalletsMustBeDifferent),
          ),
        );
        return;
      }
    } else if (_walletId == null || _categoryId == null) {
      shad.showToast(
        context: context,
        builder: (ctx, overlay) => shad.Alert.destructive(
          content: Text(ctx.l10n.financeSelectWalletAndCategoryFirst),
        ),
      );
      return;
    }

    if (amount == null) {
      shad.showToast(
        context: context,
        builder: (ctx, overlay) => shad.Alert.destructive(
          content: Text(l10n.financeInvalidAmount),
        ),
      );
      return;
    }

    final destinationAmountText = _destinationAmountController.text.trim();
    final destinationAmount = _isTransfer && destinationAmountText.isNotEmpty
        ? _parseAmount(
            destinationAmountText,
            currencyCode: _selectedDestinationCurrency,
          )
        : null;

    if (_isTransfer &&
        destinationAmountText.isNotEmpty &&
        destinationAmount == null) {
      shad.showToast(
        context: context,
        builder: (ctx, overlay) => shad.Alert.destructive(
          content: Text(ctx.l10n.financeInvalidDestinationAmount),
        ),
      );
      return;
    }

    setState(() => _isSaving = true);

    try {
      final normalizedDescription = _descriptionController.text.trim().isEmpty
          ? null
          : _descriptionController.text.trim();

      if (_isCreate && _isTransfer) {
        await widget.repository.createTransfer(
          wsId: widget.wsId,
          originWalletId: _walletId!,
          destinationWalletId: _destinationWalletId!,
          amount: amount.abs(),
          destinationAmount: destinationAmount,
          description: normalizedDescription,
          takenAt: _takenAt,
          reportOptIn: _reportOptIn,
        );

        if (!mounted) return;
        Navigator.of(context).pop(true);
        return;
      }

      final selectedCategory = _selectedCategory;
      final isExpense = selectedCategory?.isExpense != false;
      final signedAmount = isExpense ? -amount.abs() : amount.abs();

      if (_isCreate) {
        await widget.onCreate!(
          amount: signedAmount,
          description: normalizedDescription,
          takenAt: _takenAt,
          walletId: _walletId,
          categoryId: _categoryId,
          reportOptIn: _reportOptIn,
          isAmountConfidential: _isAmountConfidential,
          isDescriptionConfidential: _isDescriptionConfidential,
          isCategoryConfidential: _isCategoryConfidential,
        );

        if (!mounted) return;
        Navigator.of(context).pop(true);
        return;
      }

      final updated = await widget.onSave!(
        transactionId: widget.transaction!.id,
        amount: signedAmount,
        description: normalizedDescription,
        takenAt: _takenAt,
        walletId: _walletId,
        categoryId: _categoryId,
        reportOptIn: _reportOptIn,
        isAmountConfidential: _isAmountConfidential,
        isDescriptionConfidential: _isDescriptionConfidential,
        isCategoryConfidential: _isCategoryConfidential,
      );

      if (!mounted) return;
      Navigator.of(context).pop(updated);
    } on ApiException catch (e) {
      if (!mounted) return;
      shad.showToast(
        context: context,
        builder: (ctx, overlay) => shad.Alert.destructive(
          content: Text(e.message),
        ),
      );
      setState(() => _isSaving = false);
    } on Exception {
      if (!mounted) return;
      shad.showToast(
        context: context,
        builder: (ctx, overlay) => shad.Alert.destructive(
          content: Text(ctx.l10n.commonSomethingWentWrong),
        ),
      );
      setState(() => _isSaving = false);
    }
  }

  Future<void> _pickWallet() async {
    final selectedWalletId = await shad.showDialog<String?>(
      context: context,
      builder: (dialogCtx) {
        return shad.AlertDialog(
          title: Text(context.l10n.financeWallet),
          content: SizedBox(
            width: double.maxFinite,
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: _wallets
                    .map(
                      (wallet) => shad.GhostButton(
                        onPressed: () => Navigator.of(dialogCtx).pop(wallet.id),
                        child: Row(
                          children: [
                            WalletVisualAvatar(
                              icon: wallet.icon,
                              imageSrc: wallet.imageSrc,
                              fallbackIcon: Icons.wallet_outlined,
                              size: 28,
                            ),
                            const shad.Gap(8),
                            Expanded(
                              child: Text(
                                wallet.name ?? '',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            Text(
                              wallet.currency ?? 'USD',
                              style: shad.Theme.of(dialogCtx).typography.xSmall
                                  .copyWith(
                                    color: shad.Theme.of(
                                      dialogCtx,
                                    ).colorScheme.mutedForeground,
                                  ),
                            ),
                          ],
                        ),
                      ),
                    )
                    .toList(),
              ),
            ),
          ),
          actions: [
            shad.OutlineButton(
              onPressed: () => Navigator.of(dialogCtx).pop(),
              child: Text(context.l10n.commonCancel),
            ),
          ],
        );
      },
    );

    if (selectedWalletId == null || !mounted) return;
    setState(() {
      _walletId = selectedWalletId;
      if (_destinationWalletId == selectedWalletId) {
        _destinationWalletId = null;
      }
    });
  }

  Future<void> _pickDestinationWallet() async {
    final selectedWalletId = await shad.showDialog<String?>(
      context: context,
      builder: (dialogCtx) {
        return shad.AlertDialog(
          title: Text(context.l10n.financeDestinationWallet),
          content: SizedBox(
            width: double.maxFinite,
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: _wallets
                    .where((wallet) => wallet.id != _walletId)
                    .map(
                      (wallet) => shad.GhostButton(
                        onPressed: () => Navigator.of(dialogCtx).pop(wallet.id),
                        child: Row(
                          children: [
                            WalletVisualAvatar(
                              icon: wallet.icon,
                              imageSrc: wallet.imageSrc,
                              fallbackIcon: Icons.wallet_outlined,
                              size: 28,
                            ),
                            const shad.Gap(8),
                            Expanded(
                              child: Text(
                                wallet.name ?? '',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            Text(
                              wallet.currency ?? 'USD',
                              style: shad.Theme.of(dialogCtx).typography.xSmall
                                  .copyWith(
                                    color: shad.Theme.of(
                                      dialogCtx,
                                    ).colorScheme.mutedForeground,
                                  ),
                            ),
                          ],
                        ),
                      ),
                    )
                    .toList(),
              ),
            ),
          ),
          actions: [
            shad.OutlineButton(
              onPressed: () => Navigator.of(dialogCtx).pop(),
              child: Text(context.l10n.commonCancel),
            ),
          ],
        );
      },
    );

    if (selectedWalletId == null || !mounted) return;
    setState(() => _destinationWalletId = selectedWalletId);
  }

  Future<void> _pickCategory() async {
    final selectedCategoryId = await shad.showDialog<String?>(
      context: context,
      builder: (dialogCtx) {
        return shad.AlertDialog(
          title: Text(context.l10n.financeCategory),
          content: SizedBox(
            width: double.maxFinite,
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: _categories
                    .map(
                      (category) => shad.GhostButton(
                        onPressed: () =>
                            Navigator.of(dialogCtx).pop(category.id),
                        child: Row(
                          children: [
                            Container(
                              width: 26,
                              height: 26,
                              decoration: BoxDecoration(
                                color: _categoryColor(
                                  category,
                                ).withValues(alpha: 0.16),
                                shape: BoxShape.circle,
                              ),
                              child: Icon(
                                resolvePlatformIcon(
                                  category.icon,
                                  fallback: category.isExpense != false
                                      ? Icons.arrow_downward
                                      : Icons.arrow_upward,
                                ),
                                size: 14,
                                color: _categoryColor(category),
                              ),
                            ),
                            const shad.Gap(8),
                            Expanded(
                              child: Text(
                                category.name ?? '',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ),
                    )
                    .toList(),
              ),
            ),
          ),
          actions: [
            shad.OutlineButton(
              onPressed: () => Navigator.of(dialogCtx).pop(),
              child: Text(context.l10n.commonCancel),
            ),
          ],
        );
      },
    );

    if (selectedCategoryId == null || !mounted) return;
    setState(() => _categoryId = selectedCategoryId);
  }

  Future<void> _pickDateTime(BuildContext context) async {
    final date = await showDatePicker(
      context: context,
      initialDate: _takenAt,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (date == null || !context.mounted) return;

    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_takenAt),
    );
    if (time == null) return;
    if (!context.mounted) return;

    setState(() {
      _takenAt = DateTime(
        date.year,
        date.month,
        date.day,
        time.hour,
        time.minute,
      );
    });
  }

  Wallet? get _selectedWallet {
    return _wallets.where((w) => w.id == _walletId).firstOrNull;
  }

  Wallet? get _selectedDestinationWallet {
    return _wallets.where((w) => w.id == _destinationWalletId).firstOrNull;
  }

  TransactionCategory? get _selectedCategory {
    return _categories.where((c) => c.id == _categoryId).firstOrNull;
  }

  String get _selectedCurrency => _selectedWallet?.currency ?? 'USD';

  String get _selectedDestinationCurrency =>
      _selectedDestinationWallet?.currency ?? _selectedCurrency;

  bool get _canEditAmountFields {
    if (_walletId == null) return false;
    if (_isTransfer) return _destinationWalletId != null;
    return _categoryId != null;
  }

  IconData get _selectedCategoryIcon {
    final category = _selectedCategory;
    return resolvePlatformIcon(
      category?.icon,
      fallback: category?.isExpense != false
          ? Icons.arrow_downward
          : Icons.arrow_upward,
    );
  }

  Color get _selectedCategoryColor {
    final category = _selectedCategory;
    if (category == null) {
      return shad.Theme.of(context).colorScheme.mutedForeground;
    }
    return _categoryColor(category);
  }

  String get _amountPreview {
    final parsed = _parseAmount(
      _amountController.text,
      currencyCode: _selectedCurrency,
    );
    if (parsed == null) {
      return '${context.l10n.financeAmount}: --';
    }

    if (_isTransfer) {
      final formatted = formatCurrency(parsed.abs(), _selectedCurrency);
      return '${context.l10n.financeAmount}: $formatted';
    }

    final isExpense = _selectedCategory?.isExpense != false;
    final signed = isExpense ? -parsed.abs() : parsed.abs();
    final formatted = formatCurrency(signed, _selectedCurrency);
    return '${context.l10n.financeAmount}: $formatted';
  }

  bool get _isCrossCurrency {
    final origin = _selectedWallet?.currency?.toUpperCase();
    final dest = _selectedDestinationWallet?.currency?.toUpperCase();
    if (origin == null || dest == null) return false;
    return origin != dest;
  }

  String get _exchangeRatePreview {
    final srcAmount = _parseAmount(
      _amountController.text,
      currencyCode: _selectedCurrency,
    );
    final dstAmount = _parseAmount(
      _destinationAmountController.text,
      currencyCode: _selectedDestinationCurrency,
    );
    if (srcAmount == null || dstAmount == null || srcAmount == 0) return '';
    final rate = dstAmount / srcAmount;
    return '1 $_selectedCurrency = '
        '${rate.toStringAsFixed(4)} $_selectedDestinationCurrency';
  }

  String get _destinationAmountPreview {
    final parsed = _parseAmount(
      _destinationAmountController.text,
      currencyCode: _selectedDestinationCurrency,
    );

    if (parsed == null) {
      return '${context.l10n.financeDestinationAmountOptional}: --';
    }

    return '${context.l10n.financeDestinationAmountOptional}: '
        '${formatCurrency(parsed.abs(), _selectedDestinationCurrency)}';
  }

  String _formatInitialAmount(double value) {
    final fixed = value.toStringAsFixed(6);
    final trimmed = fixed.replaceFirst(RegExp(r'\.?0+$'), '');
    if (trimmed == '-0') return '0';
    return trimmed;
  }

  void _reconcileSelectedIds() {
    final hasWallet =
        _walletId != null && _wallets.any((wallet) => wallet.id == _walletId);
    final hasDestinationWallet =
        _destinationWalletId != null &&
        _wallets.any((wallet) => wallet.id == _destinationWalletId);
    final hasCategory =
        _categoryId != null &&
        _categories.any((category) => category.id == _categoryId);

    _walletId = hasWallet
        ? _walletId
        : (_isCreate ? null : (_wallets.isNotEmpty ? _wallets.first.id : null));

    if (_isTransfer) {
      if (!hasDestinationWallet || _destinationWalletId == _walletId) {
        _destinationWalletId = null;
      }
      _categoryId = null;
      return;
    }

    _destinationWalletId = null;
    _categoryId = hasCategory
        ? _categoryId
        : (_isCreate
              ? null
              : (_categories.isNotEmpty ? _categories.first.id : null));
  }

  NumberSymbols get _localeNumberSymbols {
    final locale = Localizations.localeOf(context).toString();
    return NumberFormat.decimalPattern(locale).symbols;
  }

  String get _localeDecimalSeparator => _localeNumberSymbols.DECIMAL_SEP;

  String get _localeGroupingSeparator => _localeNumberSymbols.GROUP_SEP;

  String _normalizeAmountInput(String rawValue) {
    var normalized = rawValue.trim();
    if (normalized.isEmpty) return normalized;

    normalized = normalized.replaceAll(RegExp(r'[\s\u00A0\u202F]'), '');

    final grouping = _localeGroupingSeparator;
    if (grouping.isNotEmpty) {
      normalized = normalized.replaceAll(grouping, '');
    }

    final decimal = _localeDecimalSeparator;
    if (decimal.isNotEmpty && decimal != '.') {
      normalized = normalized.replaceAll(decimal, '.');
    }

    return normalized;
  }

  double? _parseAmount(String rawValue, {String? currencyCode}) {
    final normalized = _normalizeAmountInput(rawValue);
    if (normalized.isEmpty) return null;

    final value = double.tryParse(normalized);
    if (value == null) return null;

    final code = currencyCode ?? _selectedCurrency;
    if (_currencyFractionDigits(code) == 0 && value % 1 != 0) {
      return null;
    }

    return value;
  }

  int _currencyFractionDigits(String code) {
    final upper = code.toUpperCase();
    const fractionDigitsByCurrency = <String, int>{
      'BHD': 3,
      'IQD': 3,
      'JOD': 3,
      'KWD': 3,
      'LYD': 3,
      'OMR': 3,
      'TND': 3,
    };

    final configuredDigits = fractionDigitsByCurrency[upper];
    if (configuredDigits != null) return configuredDigits;

    try {
      return NumberFormat.currency(name: upper).maximumFractionDigits;
    } on Exception {
      return 2;
    }
  }

  List<TextInputFormatter> _amountInputFormatters(String currencyCode) {
    final digits = _currencyFractionDigits(currencyCode);
    final decimalSeparator = _localeDecimalSeparator;
    final escapedDecimal = RegExp.escape(decimalSeparator);
    return [
      FilteringTextInputFormatter.allow(
        RegExp(digits == 0 ? '[0-9]' : '[0-9$escapedDecimal]'),
      ),
      TextInputFormatter.withFunction((oldValue, newValue) {
        if (newValue.text.isEmpty) return newValue;

        final separatorMatches = RegExp(
          escapedDecimal,
        ).allMatches(newValue.text);
        if (separatorMatches.length > 1) {
          return oldValue;
        }

        if (digits == 0 && separatorMatches.isNotEmpty) {
          return oldValue;
        }

        if (digits > 0 && separatorMatches.isNotEmpty) {
          final separatorIndex = separatorMatches.first.start;
          final decimalLength = newValue.text.length - separatorIndex - 1;
          if (decimalLength > digits) {
            return oldValue;
          }
        }
        return newValue;
      }),
    ];
  }

  Color _categoryColor(TransactionCategory category) {
    final parsed = _parseHexColor(category.color);
    if (parsed != null) return parsed;
    final isExpense = category.isExpense != false;
    final colorScheme = shad.Theme.of(context).colorScheme;
    return isExpense ? colorScheme.destructive : colorScheme.primary;
  }
}
