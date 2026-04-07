part of 'transaction_detail_sheet.dart';

mixin _TransactionFormDialogStateHelpers on State<_TransactionFormDialog> {
  // Fields (declared in mixin so methods can access them)
  late final TextEditingController _amountController;
  late final TextEditingController _destinationAmountController;
  late final TextEditingController _descriptionController;
  late final FocusNode _sourceAmountFocusNode;
  late final FocusNode _destinationAmountFocusNode;
  final Object _moneyTapRegionGroup = Object();
  late DateTime _takenAt;

  List<Wallet> _wallets = const [];
  List<TransactionCategory> _categories = const [];
  List<FinanceTag> _tags = const [];
  String _workspaceCurrency = '';
  String? _walletId;
  String? _destinationWalletId;
  String? _categoryId;
  List<String> _tagIds = const [];
  bool _isTransfer = false;
  bool _reportOptIn = true;
  bool _isAmountConfidential = false;
  bool _isDescriptionConfidential = false;
  bool _isCategoryConfidential = false;

  bool _isLoadingOptions = false;
  String? _optionsError;
  bool _isSaving = false;
  bool _showSettings = false;

  bool _isDestinationOverridden = false;
  _MoneyFieldTarget _activeMoneyField = _MoneyFieldTarget.source;

  bool get _isCreate => widget.transaction == null;

  FocusNode get _activeMoneyFocusNode => switch (_activeMoneyField) {
    _MoneyFieldTarget.source => _sourceAmountFocusNode,
    _MoneyFieldTarget.destination => _destinationAmountFocusNode,
  };

  TextEditingController get _activeMoneyController =>
      switch (_activeMoneyField) {
        _MoneyFieldTarget.source => _amountController,
        _MoneyFieldTarget.destination => _destinationAmountController,
      };

  String get _activeMoneyCurrency => switch (_activeMoneyField) {
    _MoneyFieldTarget.source => _selectedCurrency,
    _MoneyFieldTarget.destination => _selectedDestinationCurrency,
  };

  bool get _canEditDestinationAmount =>
      _isTransfer && _destinationWalletId != null && !_isAutoMode;

  bool get _isMoneyKeypadVisible =>
      _sourceAmountFocusNode.hasFocus || _destinationAmountFocusNode.hasFocus;

  bool _isMoneyFieldActive(_MoneyFieldTarget target) =>
      _activeMoneyField == target &&
      switch (target) {
        _MoneyFieldTarget.source => true,
        _MoneyFieldTarget.destination => _canEditDestinationAmount,
      };

  void _setActiveMoneyField(_MoneyFieldTarget target) {
    final nextTarget =
        target == _MoneyFieldTarget.destination && !_canEditDestinationAmount
        ? _MoneyFieldTarget.source
        : target;
    if (_activeMoneyField == nextTarget && _activeMoneyFocusNode.hasFocus) {
      return;
    }
    setState(() => _activeMoneyField = nextTarget);
    _activeMoneyFocusNode.requestFocus();
  }

  void _handleMoneyFocusChanged() {
    if (!mounted) return;
    setState(() {});
  }

  void _dismissMoneyInput() {
    if (!_isMoneyKeypadVisible) return;
    _sourceAmountFocusNode.unfocus();
    _destinationAmountFocusNode.unfocus();
  }

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
    final formatted = _formatEditableAmountForInput(
      calculated,
      currencyCode: _selectedDestinationCurrency,
    );
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
      final results = await Future.wait<dynamic>([
        widget.repository.getWallets(widget.wsId),
        widget.repository.getCategories(widget.wsId),
        widget.repository.getTags(widget.wsId),
        widget.repository.getWorkspaceDefaultCurrency(widget.wsId),
      ]);
      final wallets = results[0] as List<Wallet>;
      final categories = results[1] as List<TransactionCategory>;
      final tags = results[2] as List<FinanceTag>;
      final workspaceCurrency = results[3] as String;

      if (!mounted) return;
      setState(() {
        _workspaceCurrency = workspaceCurrency;
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
    final destinationAmountText = _destinationAmountController.text.trim();
    double? destinationAmount;
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

    if (_isTransfer && _isCrossCurrency) {
      destinationAmount = _parseAmount(
        destinationAmountText,
        currencyCode: _selectedDestinationCurrency,
      );
      if (destinationAmount == null || destinationAmount <= 0) {
        final rate = _suggestedExchangeRate;
        if (rate != null && rate.isFinite && rate > 0) {
          destinationAmount = _roundTransferAmount(amount.abs() * rate);
          _destinationAmountController.text = _formatEditableAmountForInput(
            destinationAmount,
            currencyCode: _selectedDestinationCurrency,
          );
        }
      }
      if (destinationAmount == null || destinationAmount <= 0) {
        shad.showToast(
          context: rootCtx,
          builder: (ctx, overlay) => shad.Alert.destructive(
            content: Text(ctx.l10n.financeInvalidDestinationAmount),
          ),
        );
        return;
      }
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
          tagIds: _tagIds,
        );

        if (!mounted) return;
        Navigator.of(context).pop(true);
        return;
      }

      final selectedCategory = _displaySelectedCategory;
      final isExpense = selectedCategory?.isExpense != false;
      final signedAmount = isExpense ? -amount.abs() : amount.abs();

      if (_isCreate) {
        await widget.onCreate!(
          amount: signedAmount,
          description: normalizedDescription,
          takenAt: _takenAt,
          walletId: _walletId,
          categoryId: _categoryId,
          tagIds: _tagIds.isEmpty ? null : _tagIds,
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
          tagIds: _tagIds,
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
        tagIds: _tagIds,
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
    final selectedWalletId = await showFinanceModal<String?>(
      context: context,
      builder: (_) => _WalletPickerDialog(
        wallets: _wallets,
        title: context.l10n.financeWallet,
        selectedWalletId: _walletId,
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
    final selectedWalletId = await showFinanceModal<String?>(
      context: context,
      builder: (_) => _WalletPickerDialog(
        wallets: _wallets,
        title: context.l10n.financeDestinationWallet,
        excludeWalletId: _walletId,
        selectedWalletId: _destinationWalletId,
      ),
    );

    if (selectedWalletId == null || !mounted) return;
    setState(() {
      _destinationWalletId = selectedWalletId;
      if (_isCreate) _isDestinationOverridden = false;
      if (!_canEditDestinationAmount) {
        _activeMoneyField = _MoneyFieldTarget.source;
      }
    });
    _tryAutoFillDestinationAmount();
  }

  Future<void> _pickCategory() async {
    final selectedCategoryId = await showFinanceModal<String?>(
      context: context,
      builder: (_) => _CategoryPickerDialog(
        categories: _categories,
        categoryColor: _categoryColor,
        selectedCategoryId: _categoryId,
        initialShowsExpense: _displaySelectedCategory?.isExpense ?? true,
      ),
    );

    if (selectedCategoryId == null || !mounted) return;
    setState(() => _categoryId = selectedCategoryId);
  }

  Future<void> _pickTag() async {
    final selectedTagIds = await showFinanceModal<List<String>?>(
      context: context,
      builder: (_) => _TagPickerDialog(
        tags: _tags,
        selectedTagIds: _tagIds,
        tagColor: _tagColor,
      ),
    );

    if (selectedTagIds == null || !mounted) return;
    setState(() => _tagIds = selectedTagIds);
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

  Wallet? get _displaySelectedWallet {
    final selected = _selectedWallet;
    if (selected != null) {
      return selected;
    }

    final transaction = widget.transaction;
    if (transaction == null || transaction.walletId != _walletId) {
      return null;
    }

    return Wallet(
      id: transaction.walletId ?? '',
      name: transaction.walletName,
      currency: transaction.walletCurrency,
      icon: transaction.walletIcon,
      imageSrc: transaction.walletImageSrc,
    );
  }

  Wallet? get _selectedDestinationWallet {
    return _wallets.where((w) => w.id == _destinationWalletId).firstOrNull;
  }

  Wallet? get _displaySelectedDestinationWallet {
    final selected = _selectedDestinationWallet;
    if (selected != null) {
      return selected;
    }

    final transfer = widget.transaction?.transfer;
    if (transfer == null || transfer.linkedWalletId != _destinationWalletId) {
      return null;
    }

    return Wallet(
      id: transfer.linkedWalletId,
      name: transfer.linkedWalletName,
      currency: transfer.linkedWalletCurrency,
    );
  }

  TransactionCategory? get _selectedCategory {
    return _categories.where((c) => c.id == _categoryId).firstOrNull;
  }

  TransactionCategory? get _displaySelectedCategory {
    final selected = _selectedCategory;
    if (selected != null) {
      return selected;
    }

    final transaction = widget.transaction;
    if (transaction == null || transaction.categoryId != _categoryId) {
      return null;
    }

    return TransactionCategory(
      id: transaction.categoryId ?? '',
      name: transaction.categoryName,
      icon: transaction.categoryIcon,
      color: transaction.categoryColor,
      isExpense: (transaction.amount ?? 0) < 0,
    );
  }

  List<FinanceTag> get _selectedTags {
    if (_tagIds.isEmpty) {
      return const [];
    }
    final selected = _tagIds.toSet();
    return _tags
        .where((tag) => selected.contains(tag.id))
        .toList(growable: false);
  }

  List<FinanceTag> get _displaySelectedTags {
    final selectedTags = _selectedTags;
    if (selectedTags.isNotEmpty) {
      return selectedTags;
    }

    final fallbackTags = widget.transaction?.tags ?? const [];
    if (fallbackTags.isEmpty || _tagIds.isEmpty) {
      return const [];
    }

    final selected = _tagIds.toSet();
    return fallbackTags
        .where((tag) => selected.contains(tag.id))
        .map(
          (tag) => FinanceTag(
            id: tag.id,
            name: tag.name,
            color: tag.color,
          ),
        )
        .toList(growable: false);
  }

  String get _selectedCurrency =>
      _displaySelectedWallet?.currency?.trim().isNotEmpty == true
      ? _displaySelectedWallet!.currency!.trim().toUpperCase()
      : _workspaceCurrency;

  String get _selectedDestinationCurrency =>
      _displaySelectedDestinationWallet?.currency?.trim().isNotEmpty == true
      ? _displaySelectedDestinationWallet!.currency!.trim().toUpperCase()
      : _selectedCurrency;

  IconData get _selectedCategoryIcon {
    final category = _displaySelectedCategory;
    return resolvePlatformIcon(
      category?.icon,
      fallback: category?.isExpense != false
          ? Icons.arrow_downward
          : Icons.arrow_upward,
    );
  }

  Color get _selectedCategoryColor {
    final category = _displaySelectedCategory;
    if (category == null) {
      return shad.Theme.of(context).colorScheme.mutedForeground;
    }
    return _categoryColor(category);
  }

  Color get _selectedTagColor {
    final tag = _displaySelectedTags.firstOrNull;
    if (tag == null) {
      return shad.Theme.of(context).colorScheme.mutedForeground;
    }
    return _tagColor(tag);
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

  bool get _isAutoMode =>
      _isCrossCurrency &&
      !_isDestinationOverridden &&
      _suggestedExchangeRate != null;

  bool get _hasMoneyExpression => containsAmountOperator(
    _activeMoneyController.text,
    decimalSeparator: _localeDecimalSeparator,
    groupingSeparator: _localeGroupingSeparator,
  );

  String _formattedMoneyFieldLabel(_MoneyFieldTarget target) {
    final currency = switch (target) {
      _MoneyFieldTarget.source => _selectedCurrency,
      _MoneyFieldTarget.destination => _selectedDestinationCurrency,
    };
    final rawText = switch (target) {
      _MoneyFieldTarget.source => _amountController.text.trim(),
      _MoneyFieldTarget.destination => _destinationAmountController.text.trim(),
    };
    if (rawText.isEmpty) {
      return '';
    }
    if (containsAmountOperator(
      rawText,
      decimalSeparator: _localeDecimalSeparator,
      groupingSeparator: _localeGroupingSeparator,
    )) {
      return formatAmountExpressionPreview(
        rawText,
        currencyCode: currency,
        decimalSeparator: _localeDecimalSeparator,
        groupingSeparator: _localeGroupingSeparator,
        locale: Localizations.localeOf(context).toString(),
      );
    }
    final parsed = _parseAmount(rawText, currencyCode: currency);
    if (parsed == null) {
      return formatAmountExpressionPreview(
        rawText,
        currencyCode: currency,
        decimalSeparator: _localeDecimalSeparator,
        groupingSeparator: _localeGroupingSeparator,
        locale: Localizations.localeOf(context).toString(),
      );
    }
    return formatCurrency(parsed.abs(), currency);
  }

  String _formatMoneySuggestion(
    double value, {
    required String currencyCode,
  }) {
    final locale = Localizations.localeOf(context).toString();
    final digits = _currencyFractionDigits(currencyCode);
    final formatter = NumberFormat.decimalPattern(locale)
      ..minimumFractionDigits = 0
      ..maximumFractionDigits = digits;
    return formatter.format(value);
  }

  List<({int multiplier, String label})> get _moneySuggestions {
    if (_hasMoneyExpression) {
      return const [];
    }
    final parsed = _parseAmount(
      _activeMoneyController.text,
      currencyCode: _activeMoneyCurrency,
    );
    if (parsed == null || parsed <= 0) {
      return const [];
    }

    return [10, 100, 1000]
        .map((multiplier) {
          final value = parsed * multiplier;
          return (
            multiplier: multiplier,
            label: _formatMoneySuggestion(
              value,
              currencyCode: _activeMoneyCurrency,
            ),
          );
        })
        .toList(growable: false);
  }

  String _formatEditableAmountForInput(
    double value, {
    String? currencyCode,
  }) {
    final digits = _currencyFractionDigits(currencyCode ?? _selectedCurrency);
    final factor = _pow10(digits);
    final rounded = (value * factor).roundToDouble() / factor;
    return formatEditableAmount(
      rounded,
      decimalSeparator: _localeDecimalSeparator,
    );
  }

  void _replaceMoneyInput(
    TextEditingController controller,
    String nextValue, {
    bool syncDestinationOverride = false,
  }) {
    controller.value = TextEditingValue(
      text: nextValue,
      selection: TextSelection.collapsed(offset: nextValue.length),
    );
    if (syncDestinationOverride && _isTransfer && !_isDestinationOverridden) {
      setState(() => _isDestinationOverridden = true);
    }
  }

  void _appendMoneyInput(String token) {
    final controller = _activeMoneyController;
    final current = controller.text.trim();
    final decimalSeparator = _localeDecimalSeparator;
    const operators = {'+', '-', '*', '/'};
    final lastChar = current.isEmpty ? '' : current[current.length - 1];

    if (operators.contains(token)) {
      if (current.isEmpty) return;
      if (operators.contains(lastChar) || lastChar == decimalSeparator) return;
      _replaceMoneyInput(
        controller,
        '$current$token',
        syncDestinationOverride:
            _activeMoneyField == _MoneyFieldTarget.destination,
      );
      return;
    }

    if (token == decimalSeparator) {
      final lastOperatorIndex = current.lastIndexOf(RegExp(r'[+\-*/]'));
      final currentSegment = lastOperatorIndex >= 0
          ? current.substring(lastOperatorIndex + 1)
          : current;
      if (currentSegment.contains(decimalSeparator)) return;
      final next = currentSegment.isEmpty
          ? '${current}0$decimalSeparator'
          : '$current$token';
      _replaceMoneyInput(
        controller,
        next,
        syncDestinationOverride:
            _activeMoneyField == _MoneyFieldTarget.destination,
      );
      return;
    }

    final lastOperatorIndex = current.lastIndexOf(RegExp(r'[+\-*/]'));
    final currentSegment = lastOperatorIndex >= 0
        ? current.substring(lastOperatorIndex + 1)
        : current;
    final next =
        currentSegment == '0' && !currentSegment.contains(decimalSeparator)
        ? current.substring(0, current.length - 1) + token
        : (current.isEmpty && RegExp(r'^0+$').hasMatch(token)
              ? '0'
              : '$current$token');
    final parsed = evaluateAmountExpression(
      next,
      decimalSeparator: _localeDecimalSeparator,
      groupingSeparator: _localeGroupingSeparator,
    );
    final allowsTrailingIncompleteToken =
        next.endsWith(decimalSeparator) || operators.contains(lastChar);
    if (parsed == null && !allowsTrailingIncompleteToken) {
      return;
    }
    _replaceMoneyInput(
      controller,
      next,
      syncDestinationOverride:
          _activeMoneyField == _MoneyFieldTarget.destination,
    );
  }

  void _backspaceMoneyInput() {
    final controller = _activeMoneyController;
    if (controller.text.isEmpty) return;
    final next = controller.text.substring(0, controller.text.length - 1);
    _replaceMoneyInput(
      controller,
      next,
      syncDestinationOverride:
          _activeMoneyField == _MoneyFieldTarget.destination,
    );
  }

  void _clearMoneyInput() {
    _replaceMoneyInput(
      _activeMoneyController,
      '',
      syncDestinationOverride:
          _activeMoneyField == _MoneyFieldTarget.destination,
    );
  }

  void _evaluateMoneyInput() {
    final controller = _activeMoneyController;
    final evaluated = evaluateAmountExpression(
      controller.text,
      decimalSeparator: _localeDecimalSeparator,
      groupingSeparator: _localeGroupingSeparator,
    );
    if (evaluated == null || !evaluated.isFinite || evaluated <= 0) {
      return;
    }
    final nextValue = _formatEditableAmountForInput(
      evaluated,
      currencyCode: _activeMoneyCurrency,
    );
    _replaceMoneyInput(
      controller,
      nextValue,
      syncDestinationOverride:
          _activeMoneyField == _MoneyFieldTarget.destination,
    );
  }

  void _applyMoneyMultiplier(int multiplier) {
    final controller = _activeMoneyController;
    final parsed = _parseAmount(
      controller.text,
      currencyCode: _activeMoneyCurrency,
    );
    if (parsed == null) return;
    final nextValue = _formatEditableAmountForInput(
      parsed * multiplier,
      currencyCode: _activeMoneyCurrency,
    );
    _replaceMoneyInput(
      controller,
      nextValue,
      syncDestinationOverride:
          _activeMoneyField == _MoneyFieldTarget.destination,
    );
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
    final validTagIds = _tagIds
        .where((tagId) => _tags.any((tag) => tag.id == tagId))
        .toList(growable: false);

    _walletId = hasWallet
        ? _walletId
        : (_isCreate ? null : (_wallets.isNotEmpty ? _wallets.first.id : null));

    if (_isTransfer) {
      if (!hasDestinationWallet || _destinationWalletId == _walletId) {
        _destinationWalletId = null;
      }
      _categoryId = null;
      _tagIds = validTagIds;
      return;
    }

    _destinationWalletId = null;
    _categoryId = hasCategory
        ? _categoryId
        : (_isCreate
              ? null
              : (_categories.isNotEmpty ? _categories.first.id : null));
    _tagIds = validTagIds;
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
