part of 'transaction_detail_sheet.dart';

mixin _TransactionFormDialogStateHelpers on State<_TransactionFormDialog> {
  // Fields (declared in mixin so methods can access them)
  late final TextEditingController _amountController;
  late final TextEditingController _destinationAmountController;
  late final TextEditingController _descriptionController;
  late DateTime _takenAt;

  List<Wallet> _wallets = const [];
  List<TransactionCategory> _categories = const [];
  List<FinanceTag> _tags = const [];
  String? _walletId;
  String? _destinationWalletId;
  String? _categoryId;
  String? _tagId;
  bool _isTransfer = false;
  bool _reportOptIn = true;
  bool _isAmountConfidential = false;
  bool _isDescriptionConfidential = false;
  bool _isCategoryConfidential = false;
  int _tabIndex = 0;

  bool _isLoadingOptions = false;
  String? _optionsError;
  bool _isSaving = false;

  bool _isDestinationOverridden = false;
  bool _isRateInverted = false;

  bool get _isCreate => widget.transaction == null;

  /// Auto-fills the destination amount from source × exchange rate.
  void _tryAutoFillDestinationAmount() {
    if (_isDestinationOverridden) return;
    if (!_isTransfer || !_isCrossCurrency) return;
    final rate = _suggestedExchangeRate;
    if (rate == null) return;
    final src = _parseAmount(
      _amountController.text,
      currencyCode: _selectedCurrency,
    );
    if (src == null || src <= 0) return;
    final calculated = _roundTransferAmount(src * rate);
    if (!calculated.isFinite || calculated <= 0) return;
    final formatted = formatInitialAmount(calculated);
    if (_destinationAmountController.text != formatted) {
      _destinationAmountController.text = formatted;
    }
  }

  double _roundTransferAmount(double value) {
    final digits = currencyFractionDigitsForCode(_selectedDestinationCurrency);
    final factor = _pow10(digits);
    return (value * factor).roundToDouble() / factor;
  }

  double _pow10(int exp) {
    var result = 1.0;
    for (var i = 0; i < exp; i++) {
      result *= 10;
    }
    return result;
  }

  Future<void> _loadOptions() async {
    setState(() {
      _isLoadingOptions = true;
      _optionsError = null;
    });

    try {
      final wallets = await widget.repository.getWallets(widget.wsId);
      final categories = await widget.repository.getCategories(widget.wsId);
      final tags = await widget.repository.getTags(widget.wsId);

      if (!mounted) return;
      setState(() {
        _wallets = wallets;
        _categories = categories;
        _tags = tags;
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
    final rootCtx = Navigator.of(context, rootNavigator: true).context;
    _reconcileSelectedIds();
    final amount = _parseAmount(_amountController.text);
    if (_isTransfer) {
      if (_walletId == null || _destinationWalletId == null) {
        shad.showToast(
          context: rootCtx,
          builder: (ctx, overlay) => shad.Alert.destructive(
            content: Text(ctx.l10n.financeSelectWalletAndDestinationFirst),
          ),
        );
        return;
      }

      if (_walletId == _destinationWalletId) {
        shad.showToast(
          context: rootCtx,
          builder: (ctx, overlay) => shad.Alert.destructive(
            content: Text(ctx.l10n.financeWalletsMustBeDifferent),
          ),
        );
        return;
      }
    } else if (_walletId == null || _categoryId == null) {
      shad.showToast(
        context: rootCtx,
        builder: (ctx, overlay) => shad.Alert.destructive(
          content: Text(ctx.l10n.financeSelectWalletAndCategoryFirst),
        ),
      );
      return;
    }

    if (amount == null || amount <= 0) {
      shad.showToast(
        context: rootCtx,
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
        (destinationAmount == null || destinationAmount <= 0)) {
      shad.showToast(
        context: rootCtx,
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
          tagIds: _tagId == null ? null : [_tagId!],
          reportOptIn: _reportOptIn,
          isAmountConfidential: _isAmountConfidential,
          isDescriptionConfidential: _isDescriptionConfidential,
          isCategoryConfidential: _isCategoryConfidential,
        );

        if (!mounted) return;
        Navigator.of(context).pop(true);
        return;
      }

      if (_isTransfer) {
        final transfer = widget.transaction?.transfer;
        if (transfer == null ||
            _walletId == null ||
            _destinationWalletId == null) {
          throw const ApiException(
            statusCode: 400,
            message: 'Invalid transfer context',
          );
        }

        final sourceAmount = transfer.isOrigin
            ? amount.abs()
            : (destinationAmount?.abs() ?? amount.abs());
        final transferDestinationAmount = _isCrossCurrency
            ? (transfer.isOrigin
                  ? (destinationAmount?.abs() ?? amount.abs())
                  : amount.abs())
            : sourceAmount;

        final updated = await widget.repository.updateTransfer(
          wsId: widget.wsId,
          originTransactionId: transfer.isOrigin
              ? widget.transaction!.id
              : transfer.linkedTransactionId,
          destinationTransactionId: transfer.isOrigin
              ? transfer.linkedTransactionId
              : widget.transaction!.id,
          originWalletId: transfer.isOrigin
              ? _walletId!
              : _destinationWalletId!,
          destinationWalletId: transfer.isOrigin
              ? _destinationWalletId!
              : _walletId!,
          amount: sourceAmount,
          destinationAmount: transferDestinationAmount,
          description: normalizedDescription,
          takenAt: _takenAt,
          reportOptIn: _reportOptIn,
          refreshedTransactionId: widget.transaction!.id,
        );

        if (!mounted) return;
        Navigator.of(context).pop(updated);
        return;
      }

      final updated = await widget.onSave!(
        transactionId: widget.transaction!.id,
        amount: signedAmount,
        description: normalizedDescription,
        takenAt: _takenAt,
        walletId: _walletId,
        categoryId: _categoryId,
        tagIds: _tagId == null ? const <String>[] : [_tagId!],
        reportOptIn: _reportOptIn,
        isAmountConfidential: _isAmountConfidential,
        isDescriptionConfidential: _isDescriptionConfidential,
        isCategoryConfidential: _isCategoryConfidential,
      );

      if (!mounted) return;
      Navigator.of(context).pop(updated);
    } on ApiException catch (e) {
      if (!mounted) return;
      final message = e.message.trim();
      if (rootCtx.mounted) {
        shad.showToast(
          context: rootCtx,
          builder: (ctx, overlay) => shad.Alert.destructive(
            content: Text(
              message.isEmpty ? ctx.l10n.commonSomethingWentWrong : message,
            ),
          ),
        );
      }
      setState(() => _isSaving = false);
    } on Exception {
      if (!mounted) return;
      if (rootCtx.mounted) {
        shad.showToast(
          context: rootCtx,
          builder: (ctx, overlay) => shad.Alert.destructive(
            content: Text(ctx.l10n.commonSomethingWentWrong),
          ),
        );
      }
      setState(() => _isSaving = false);
    }
  }

  Future<void> _pickWallet() async {
    final selectedWalletId = await shad.showDialog<String?>(
      context: context,
      builder: (_) => _WalletPickerDialog(
        wallets: _wallets,
        title: context.l10n.financeWallet,
      ),
    );

    if (selectedWalletId == null || !mounted) return;
    setState(() {
      _walletId = selectedWalletId;
      if (_destinationWalletId == selectedWalletId) {
        _destinationWalletId = null;
      }
      if (_isCreate) _isDestinationOverridden = false;
    });
    _tryAutoFillDestinationAmount();
  }

  Future<void> _pickDestinationWallet() async {
    final selectedWalletId = await shad.showDialog<String?>(
      context: context,
      builder: (_) => _WalletPickerDialog(
        wallets: _wallets,
        title: context.l10n.financeDestinationWallet,
        excludeWalletId: _walletId,
      ),
    );

    if (selectedWalletId == null || !mounted) return;
    setState(() {
      _destinationWalletId = selectedWalletId;
      if (_isCreate) _isDestinationOverridden = false;
    });
    _tryAutoFillDestinationAmount();
  }

  Future<void> _pickCategory() async {
    final selectedCategoryId = await shad.showDialog<String?>(
      context: context,
      builder: (_) => _CategoryPickerDialog(
        categories: _categories,
        categoryColor: _categoryColor,
      ),
    );

    if (selectedCategoryId == null || !mounted) return;
    setState(() => _categoryId = selectedCategoryId);
  }

  Future<void> _pickTag() async {
    final selectedTagId = await shad.showDialog<String?>(
      context: context,
      builder: (_) => _TagPickerDialog(
        tags: _tags,
        selectedTagId: _tagId,
        tagColor: _tagColor,
      ),
    );

    if (selectedTagId == null || !mounted) return;
    setState(() => _tagId = selectedTagId.isEmpty ? null : selectedTagId);
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

  FinanceTag? get _selectedTag {
    return _tags.where((tag) => tag.id == _tagId).firstOrNull;
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

  Color get _selectedTagColor {
    final tag = _selectedTag;
    if (tag == null) {
      return shad.Theme.of(context).colorScheme.mutedForeground;
    }
    return _tagColor(tag);
  }

  String get _amountPreview {
    final parsed = _parseAmount(
      _amountController.text,
      currencyCode: _selectedCurrency,
    );
    if (parsed == null) {
      return '${context.l10n.financeAmount}: --';
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

  double? get _suggestedExchangeRate {
    if (!_isTransfer || !_isCrossCurrency) return null;
    final rates = widget.exchangeRates;
    if (rates == null || rates.isEmpty) return null;
    final converted = convertCurrency(
      1,
      _selectedCurrency,
      _selectedDestinationCurrency,
      rates,
    );
    if (converted == null || !converted.isFinite || converted <= 0) return null;
    return converted;
  }

  double? get _effectiveRate {
    if (!_isCrossCurrency) return null;
    final suggested = _suggestedExchangeRate;
    if (suggested != null && suggested > 0) return suggested;
    final src = _parseAmount(
      _amountController.text,
      currencyCode: _selectedCurrency,
    );
    final dst = _parseAmount(
      _destinationAmountController.text,
      currencyCode: _selectedDestinationCurrency,
    );
    if (src == null || dst == null || src == 0) return null;
    return dst / src;
  }

  bool get _isAutoMode =>
      _isCrossCurrency &&
      !_isDestinationOverridden &&
      _suggestedExchangeRate != null;

  String get _exchangeRateDisplay {
    final rate = _effectiveRate;
    if (rate == null || !rate.isFinite) return '';
    final originCur = _selectedCurrency;
    final destCur = _selectedDestinationCurrency;
    if (_isRateInverted) {
      final inv = 1 / rate;
      return '1 $destCur = ${inv.toStringAsFixed(4)} $originCur';
    }
    return '1 $originCur = ${rate.toStringAsFixed(4)} $destCur';
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

  void _reconcileSelectedIds() {
    final hasWallet =
        _walletId != null && _wallets.any((wallet) => wallet.id == _walletId);
    final hasDestinationWallet =
        _destinationWalletId != null &&
        _wallets.any((wallet) => wallet.id == _destinationWalletId);
    final hasCategory =
        _categoryId != null &&
        _categories.any((category) => category.id == _categoryId);
    final hasTag = _tagId != null && _tags.any((tag) => tag.id == _tagId);

    _walletId = hasWallet
        ? _walletId
        : (_isCreate ? null : (_wallets.isNotEmpty ? _wallets.first.id : null));

    if (_isTransfer) {
      if (!hasDestinationWallet || _destinationWalletId == _walletId) {
        _destinationWalletId = null;
      }
      _categoryId = null;
      _tagId = null;
      return;
    }

    _destinationWalletId = null;
    _categoryId = hasCategory
        ? _categoryId
        : (_isCreate
              ? null
              : (_categories.isNotEmpty ? _categories.first.id : null));
    _tagId = hasTag ? _tagId : null;
  }

  NumberSymbols get _localeNumberSymbols {
    final locale = Localizations.localeOf(context).toString();
    return NumberFormat.decimalPattern(locale).symbols;
  }

  String get _localeDecimalSeparator => _localeNumberSymbols.DECIMAL_SEP;

  String get _localeGroupingSeparator => _localeNumberSymbols.GROUP_SEP;

  int _currencyFractionDigits(String code) =>
      currencyFractionDigitsForCode(code);

  double? _parseAmount(String rawValue, {String? currencyCode}) {
    return parseAmount(
      rawValue,
      currencyCode: currencyCode ?? _selectedCurrency,
      decimalSeparator: _localeDecimalSeparator,
      groupingSeparator: _localeGroupingSeparator,
      fractionDigitsFn: currencyFractionDigitsForCode,
    );
  }

  List<TextInputFormatter> _amountInputFormatters(String currencyCode) {
    final digits = currencyFractionDigitsForCode(currencyCode);
    return buildAmountInputFormatters(digits, _localeDecimalSeparator);
  }

  Color _categoryColor(TransactionCategory category) {
    final parsed = _parseHexColor(category.color);
    if (parsed != null) return parsed;
    final isExpense = category.isExpense != false;
    final colorScheme = shad.Theme.of(context).colorScheme;
    return isExpense ? colorScheme.destructive : colorScheme.primary;
  }

  Color _tagColor(FinanceTag tag) {
    final parsed = _parseHexColor(tag.color);
    if (parsed != null) return parsed;
    return shad.Theme.of(context).colorScheme.primary;
  }
}
