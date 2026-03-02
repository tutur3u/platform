part of 'transaction_detail_sheet.dart';

class _EditTransactionDialog extends StatefulWidget {
  const _EditTransactionDialog({
    required this.wsId,
    required this.transaction,
    required this.onSave,
  });

  final String wsId;
  final Transaction transaction;
  final Future<Transaction> Function({
    required String transactionId,
    required double amount,
    String? description,
    DateTime? takenAt,
    String? walletId,
    String? categoryId,
    bool? reportOptIn,
    bool? isAmountConfidential,
    bool? isDescriptionConfidential,
    bool? isCategoryConfidential,
  })
  onSave;

  @override
  State<_EditTransactionDialog> createState() => _EditTransactionDialogState();
}

class _EditTransactionDialogState extends State<_EditTransactionDialog> {
  final FinanceRepository _repository = FinanceRepository();
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

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final selectedWallet = _selectedWallet;
    final selectedCategory = _selectedCategory;

    return shad.AlertDialog(
      title: Text(l10n.financeEditTransaction),
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
                  Text(l10n.financeAmount, style: theme.typography.small),
                  const shad.Gap(4),
                  shad.TextField(
                    controller: _amountController,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                      signed: true,
                    ),
                    placeholder: Text(l10n.financeAmount),
                  ),
                  const shad.Gap(16),
                  Text(l10n.financeDescription, style: theme.typography.small),
                  const shad.Gap(4),
                  shad.TextField(
                    controller: _descriptionController,
                    maxLines: 3,
                    placeholder: Text(l10n.financeDescription),
                  ),
                  const shad.Gap(16),
                  Text(l10n.financeWallet, style: theme.typography.small),
                  const shad.Gap(4),
                  shad.OutlineButton(
                    onPressed: _wallets.isEmpty ? null : _pickWallet,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(selectedWallet?.name ?? '-'),
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
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(selectedCategory?.name ?? '-'),
                        const Icon(Icons.expand_more, size: 16),
                      ],
                    ),
                  ),
                  const shad.Gap(16),
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
              : Text(l10n.timerSave),
        ),
      ],
    );
  }

  @override
  void dispose() {
    _amountController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    final amount = widget.transaction.amount ?? 0;
    _amountController = TextEditingController(
      text: _formatInitialAmount(amount),
    );
    _descriptionController = TextEditingController(
      text: widget.transaction.description ?? '',
    );
    _takenAt =
        widget.transaction.takenAt ??
        widget.transaction.createdAt ??
        DateTime.now();
    _walletId = widget.transaction.walletId;
    _categoryId = widget.transaction.categoryId;
    _reportOptIn = widget.transaction.reportOptIn ?? true;
    _isAmountConfidential = widget.transaction.isAmountConfidential ?? false;
    _isDescriptionConfidential =
        widget.transaction.isDescriptionConfidential ?? false;
    _isCategoryConfidential =
        widget.transaction.isCategoryConfidential ?? false;

    unawaited(_loadOptions());
  }

  Future<void> _loadOptions() async {
    setState(() {
      _isLoadingOptions = true;
      _optionsError = null;
    });

    try {
      final wallets = await _repository.getWallets(widget.wsId);
      final categories = await _repository.getCategories(widget.wsId);

      if (!mounted) return;
      setState(() {
        _wallets = wallets;
        _categories = categories;
        _walletId ??= wallets.isNotEmpty ? wallets.first.id : null;
        _categoryId ??= categories.isNotEmpty ? categories.first.id : null;
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
    final amount = double.tryParse(_amountController.text.trim());
    if (_walletId == null || _categoryId == null) {
      shad.showToast(
        context: context,
        builder: (ctx, overlay) => shad.Alert.destructive(
          content: Text(ctx.l10n.commonSomethingWentWrong),
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

      final updated = await widget.onSave(
        transactionId: widget.transaction.id,
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
                        child: Align(
                          alignment: Alignment.centerLeft,
                          child: Text(wallet.name ?? ''),
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
                        child: Align(
                          alignment: Alignment.centerLeft,
                          child: Text(category.name ?? ''),
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

  String _formatInitialAmount(double value) {
    final fixed = value.toStringAsFixed(6);
    final trimmed = fixed.replaceFirst(RegExp(r'\.?0+$'), '');
    if (trimmed == '-0') return '0';
    return trimmed;
  }
}
