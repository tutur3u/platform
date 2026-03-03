part of 'transaction_detail_sheet.dart';

class _TransactionFormDialog extends StatefulWidget {
  const _TransactionFormDialog({
    required this.wsId,
    required this.repository,
    this.transaction,
    this.onSave,
    this.onCreate,
  });

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
  late final TextEditingController _descriptionController;
  late DateTime _takenAt;

  List<Wallet> _wallets = const [];
  List<TransactionCategory> _categories = const [];
  String? _walletId;
  String? _categoryId;
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
    final selectedCategory = _selectedCategory;

    return shad.AlertDialog(
      title: Text(
        _isCreate ? l10n.financeCreateTransaction : l10n.financeEditTransaction,
      ),
      content: SizedBox(
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
                  if (_walletId == null || _categoryId == null)
                    Text(
                      l10n.financeSelectWalletAndCategoryFirst,
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
                  _isCreate ? l10n.financeCreateTransaction : l10n.timerSave,
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
    _descriptionController = TextEditingController(
      text: widget.transaction?.description ?? '',
    );
    _takenAt =
        widget.transaction?.takenAt ??
        widget.transaction?.createdAt ??
        DateTime.now();
    _walletId = widget.transaction?.walletId;
    _categoryId = widget.transaction?.categoryId;
    _reportOptIn = widget.transaction?.reportOptIn ?? true;
    _isAmountConfidential = widget.transaction?.isAmountConfidential ?? false;
    _isDescriptionConfidential =
        widget.transaction?.isDescriptionConfidential ?? false;
    _isCategoryConfidential =
        widget.transaction?.isCategoryConfidential ?? false;

    _amountController.addListener(_onAmountChanged);

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
        if (!_isCreate) {
          _walletId ??= wallets.isNotEmpty ? wallets.first.id : null;
          _categoryId ??= categories.isNotEmpty ? categories.first.id : null;
        }
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
    final amount = _parseAmount(_amountController.text);
    if (_walletId == null || _categoryId == null) {
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

    setState(() => _isSaving = true);

    try {
      final selectedCategory = _selectedCategory;
      final isExpense = selectedCategory?.isExpense != false;
      final signedAmount = isExpense ? -amount.abs() : amount.abs();

      if (_isCreate) {
        await widget.onCreate!(
          amount: signedAmount,
          description: _descriptionController.text.trim().isEmpty
              ? null
              : _descriptionController.text.trim(),
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
        description: _descriptionController.text.trim().isEmpty
            ? null
            : _descriptionController.text.trim(),
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
    setState(() => _walletId = selectedWalletId);
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

  TransactionCategory? get _selectedCategory {
    return _categories.where((c) => c.id == _categoryId).firstOrNull;
  }

  String get _selectedCurrency => _selectedWallet?.currency ?? 'USD';

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
    final parsed = _parseAmount(_amountController.text);
    if (parsed == null) {
      return '${context.l10n.financeAmount}: --';
    }
    final isExpense = _selectedCategory?.isExpense != false;
    final signed = isExpense ? -parsed.abs() : parsed.abs();
    final formatted = formatCurrency(signed, _selectedCurrency);
    return '${context.l10n.financeAmount}: $formatted';
  }

  String _formatInitialAmount(double value) {
    final fixed = value.toStringAsFixed(6);
    final trimmed = fixed.replaceFirst(RegExp(r'\.?0+$'), '');
    if (trimmed == '-0') return '0';
    return trimmed;
  }

  double? _parseAmount(String rawValue) {
    final input = rawValue.trim();
    if (input.isEmpty) return null;

    try {
      final locale = Localizations.localeOf(context).toString();
      final parsed = NumberFormat.decimalPattern(locale).parse(input);
      final value = parsed.toDouble();
      if (_currencyFractionDigits(_selectedCurrency) == 0 && value % 1 != 0) {
        return null;
      }
      return value;
    } on FormatException {
      final fallback = double.tryParse(input.replaceAll(',', '.'));
      if (fallback == null) return null;
      if (_currencyFractionDigits(_selectedCurrency) == 0 &&
          fallback % 1 != 0) {
        return null;
      }
      return fallback;
    }
  }

  int _currencyFractionDigits(String code) {
    final upper = code.toUpperCase();
    return upper == 'JPY' || upper == 'VND' ? 0 : 2;
  }

  List<TextInputFormatter> _amountInputFormatters(String currencyCode) {
    final digits = _currencyFractionDigits(currencyCode);
    return [
      FilteringTextInputFormatter.allow(RegExp('[0-9.,]')),
      TextInputFormatter.withFunction((oldValue, newValue) {
        if (newValue.text.isEmpty) return newValue;
        final separatorMatches = RegExp('[.,]').allMatches(newValue.text);
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
