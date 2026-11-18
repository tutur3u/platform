part of 'transaction_categories_page.dart';

class _CategoryDialog extends StatefulWidget {
  const _CategoryDialog({
    required this.wsId,
    required this.repository,
    this.category,
  });

  final String wsId;
  final FinanceRepository repository;
  final TransactionCategory? category;

  @override
  State<_CategoryDialog> createState() => _CategoryDialogState();
}

class _CategoryDialogState extends State<_CategoryDialog> {
  late final TextEditingController _nameController;
  late bool _isExpense;
  String? _icon;
  String? _colorHex;
  String? _nameError;
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.category?.name ?? '');
    _isExpense = widget.category?.isExpense ?? true;
    _icon = widget.category?.icon;
    _colorHex = normalizeHex(widget.category?.color ?? '');
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final previewColor =
        parseHex(_colorHex) ??
        (_isExpense
            ? shad.Theme.of(context).colorScheme.destructive
            : shad.Theme.of(context).colorScheme.primary);
    final previewIcon = resolvePlatformIcon(
      _icon,
      fallback: _isExpense ? Icons.arrow_downward : Icons.arrow_upward,
    );

    return FinanceFullscreenFormScaffold(
      title: widget.category == null
          ? context.l10n.financeCreateCategory
          : context.l10n.financeEditCategory,
      subtitle: context.l10n.financeCategoryDialogSubtitle,
      primaryActionLabel: widget.category == null
          ? context.l10n.financeCreateCategory
          : context.l10n.timerSave,
      onPrimaryPressed: _isSaving ? null : _saveCategory,
      onClose: _isSaving ? null : () => Navigator.of(context).pop(false),
      isSaving: _isSaving,
      child: ListView(
        children: [
          _TaxonomyPreviewCard(
            name: _nameController.text.trim().isEmpty
                ? context.l10n.financeCreateCategory
                : _nameController.text.trim(),
            subtitle: _isExpense
                ? context.l10n.financeExpense
                : context.l10n.financeIncome,
            previewColor: previewColor,
            icon: previewIcon,
          ),
          const shad.Gap(12),
          FinanceFormSection(
            title: context.l10n.timerCategoryName,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _TaxonomyTextField(
                  controller: _nameController,
                  placeholder: context.l10n.timerCategoryName,
                  autofocus: true,
                  errorText: _nameError,
                  onChanged: _onNameChanged,
                ),
                const shad.Gap(10),
                _TaxonomyFieldLabel(label: context.l10n.financeType),
                const shad.Gap(4),
                FinanceSegmentedRow(
                  leftLabel: context.l10n.financeExpense,
                  rightLabel: context.l10n.financeIncome,
                  leftSelected: _isExpense,
                  onLeftPressed: () => setState(() => _isExpense = true),
                  onRightPressed: () => setState(() => _isExpense = false),
                ),
              ],
            ),
          ),
          const shad.Gap(12),
          FinanceFormSection(
            title: context.l10n.financeIcon,
            child: PlatformIconPickerField(
              value: _icon,
              title: context.l10n.financeSelectIcon,
              searchPlaceholder: context.l10n.financeSearchIcons,
              emptyText: context.l10n.financeNoIconsFound,
              showLabel: false,
              onChanged: (value) => setState(() => _icon = value),
            ),
          ),
          const shad.Gap(12),
          FinanceFormSection(
            title: context.l10n.calendarEventColor,
            child: _TaxonomyColorSection(
              colorHex: _colorHex ?? context.l10n.financeNoColor,
              previewColor: previewColor,
              onPickColor: _openColorPicker,
              onRandomize: () => setState(() => _colorHex = randomHexColor()),
              onClear: _colorHex == null
                  ? null
                  : () => setState(() => _colorHex = null),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _saveCategory() async {
    final nameError = _validateName(_nameController.text);
    setState(() => _nameError = nameError);
    if (nameError != null) {
      return;
    }

    final rootNav = Navigator.of(context, rootNavigator: true);
    final toastContext = rootNav.context;

    setState(() => _isSaving = true);
    try {
      final repository = widget.repository;
      final color = _colorHex;
      if (widget.category == null) {
        await repository.createCategory(
          wsId: widget.wsId,
          name: _nameController.text.trim(),
          isExpense: _isExpense,
          icon: _icon,
          color: color,
        );
      } else {
        await repository.updateCategory(
          wsId: widget.wsId,
          categoryId: widget.category!.id,
          name: _nameController.text.trim(),
          isExpense: _isExpense,
          icon: _icon,
          color: color,
        );
      }
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      final message = e.message.trim();
      final details = message.isEmpty || message == 'Request failed'
          ? context.l10n.commonSomethingWentWrong
          : message;

      if (toastContext.mounted) {
        shad.showToast(
          context: toastContext,
          builder: (ctx, _) => shad.Alert.destructive(
            title: Text(ctx.l10n.commonSomethingWentWrong),
            content: Text(details),
          ),
        );
      }
      if (mounted) {
        setState(() => _isSaving = false);
      }
    } on Exception {
      if (toastContext.mounted) {
        shad.showToast(
          context: toastContext,
          builder: (ctx, _) => shad.Alert.destructive(
            content: Text(ctx.l10n.commonSomethingWentWrong),
          ),
        );
      }
      if (mounted) {
        setState(() => _isSaving = false);
      }
    }
  }

  void _onNameChanged(String value) {
    setState(() => _nameError = _validateName(value));
  }

  String? _validateName(String value) {
    if (value.trim().isEmpty) {
      return context.l10n.financeCategoryNameRequired;
    }
    return null;
  }

  Future<void> _openColorPicker() async {
    var selected =
        parseHex(_colorHex) ??
        (_isExpense
            ? shad.Theme.of(context).colorScheme.destructive
            : shad.Theme.of(context).colorScheme.primary);

    final result = await showFinanceModal<Color>(
      context: context,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return FinanceModalScaffold(
              title: context.l10n.financePickColor,
              actions: [
                shad.OutlineButton(
                  onPressed: () => Navigator.of(dialogContext).pop(),
                  child: Text(context.l10n.commonCancel),
                ),
                shad.PrimaryButton(
                  onPressed: () => Navigator.of(dialogContext).pop(selected),
                  child: Text(context.l10n.timerSave),
                ),
              ],
              child: ColorPicker(
                pickerColor: selected,
                onColorChanged: (color) =>
                    setDialogState(() => selected = color),
                enableAlpha: false,
                portraitOnly: true,
                labelTypes: const [ColorLabelType.hex],
                pickerAreaHeightPercent: 0.72,
                displayThumbColor: true,
                hexInputBar: true,
              ),
            );
          },
        );
      },
    );

    if (result != null && mounted) {
      setState(() => _colorHex = colorToHexString(result));
    }
  }
}

class _TagDialog extends StatefulWidget {
  const _TagDialog({required this.wsId, required this.repository, this.tag});

  final String wsId;
  final FinanceRepository repository;
  final FinanceTag? tag;

  @override
  State<_TagDialog> createState() => _TagDialogState();
}

class _TagDialogState extends State<_TagDialog> {
  late final TextEditingController _nameController;
  late final TextEditingController _descriptionController;
  String? _colorHex;
  String? _nameError;
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.tag?.name ?? '');
    _descriptionController = TextEditingController(
      text: widget.tag?.description ?? '',
    );
    _colorHex = normalizeHex(widget.tag?.color ?? '') ?? '#3B82F6';
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final previewColor = parseHex(_colorHex) ?? const Color(0xFF3B82F6);

    return FinanceFullscreenFormScaffold(
      title: widget.tag == null
          ? context.l10n.financeCreateTag
          : context.l10n.financeEditTag,
      subtitle: context.l10n.financeTagDialogSubtitle,
      primaryActionLabel: widget.tag == null
          ? context.l10n.financeCreateTag
          : context.l10n.timerSave,
      onPrimaryPressed: _isSaving ? null : _saveTag,
      onClose: _isSaving ? null : () => Navigator.of(context).pop(false),
      isSaving: _isSaving,
      child: ListView(
        children: [
          _TaxonomyPreviewCard(
            name: _nameController.text.trim().isEmpty
                ? context.l10n.financeCreateTag
                : _nameController.text.trim(),
            subtitle: _descriptionController.text.trim().isEmpty
                ? context.l10n.financeTagDialogSubtitle
                : _descriptionController.text.trim(),
            previewColor: previewColor,
            icon: Icons.sell_outlined,
          ),
          const shad.Gap(12),
          FinanceFormSection(
            title: context.l10n.financeTagName,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _TaxonomyTextField(
                  controller: _nameController,
                  placeholder: context.l10n.financeTagName,
                  autofocus: true,
                  errorText: _nameError,
                  onChanged: _onNameChanged,
                ),
                const shad.Gap(10),
                _TaxonomyFieldLabel(label: context.l10n.financeDescription),
                const shad.Gap(4),
                _TaxonomyTextArea(
                  controller: _descriptionController,
                  placeholder: context.l10n.financeDescription,
                  onChanged: (_) => setState(() {}),
                ),
              ],
            ),
          ),
          const shad.Gap(12),
          FinanceFormSection(
            title: context.l10n.calendarEventColor,
            child: _TaxonomyColorSection(
              colorHex: _colorHex ?? '#3B82F6',
              previewColor: previewColor,
              onPickColor: _openColorPicker,
              onRandomize: () => setState(() => _colorHex = randomHexColor()),
              onClear: _colorHex == null
                  ? null
                  : () => setState(() => _colorHex = '#3B82F6'),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _saveTag() async {
    final nameError = _validateName(_nameController.text);
    setState(() => _nameError = nameError);
    if (nameError != null) return;

    final rootNav = Navigator.of(context, rootNavigator: true);
    final toastContext = rootNav.context;

    setState(() => _isSaving = true);
    try {
      final repository = widget.repository;
      final description = _descriptionController.text.trim();
      if (widget.tag == null) {
        await repository.createTag(
          wsId: widget.wsId,
          name: _nameController.text.trim(),
          color: _colorHex ?? '#3B82F6',
          description: description.isEmpty ? null : description,
        );
      } else {
        await repository.updateTag(
          wsId: widget.wsId,
          tagId: widget.tag!.id,
          name: _nameController.text.trim(),
          color: _colorHex ?? '#3B82F6',
          description: description.isEmpty ? null : description,
        );
      }
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      final message = e.message.trim();
      final details = message.isEmpty || message == 'Request failed'
          ? context.l10n.commonSomethingWentWrong
          : message;

      if (toastContext.mounted) {
        shad.showToast(
          context: toastContext,
          builder: (ctx, _) => shad.Alert.destructive(
            title: Text(ctx.l10n.commonSomethingWentWrong),
            content: Text(details),
          ),
        );
      }
      if (mounted) {
        setState(() => _isSaving = false);
      }
    } on Exception {
      if (toastContext.mounted) {
        shad.showToast(
          context: toastContext,
          builder: (ctx, _) => shad.Alert.destructive(
            content: Text(ctx.l10n.commonSomethingWentWrong),
          ),
        );
      }
      if (mounted) {
        setState(() => _isSaving = false);
      }
    }
  }

  void _onNameChanged(String value) {
    setState(() => _nameError = _validateName(value));
  }

  String? _validateName(String value) {
    if (value.trim().isEmpty) {
      return context.l10n.financeTagNameRequired;
    }
    return null;
  }

  Future<void> _openColorPicker() async {
    var selected = parseHex(_colorHex) ?? const Color(0xFF3B82F6);

    final result = await showFinanceModal<Color>(
      context: context,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return FinanceModalScaffold(
              title: context.l10n.financePickColor,
              actions: [
                shad.OutlineButton(
                  onPressed: () => Navigator.of(dialogContext).pop(),
                  child: Text(context.l10n.commonCancel),
                ),
                shad.PrimaryButton(
                  onPressed: () => Navigator.of(dialogContext).pop(selected),
                  child: Text(context.l10n.timerSave),
                ),
              ],
              child: ColorPicker(
                pickerColor: selected,
                onColorChanged: (color) =>
                    setDialogState(() => selected = color),
                enableAlpha: false,
                portraitOnly: true,
                labelTypes: const [ColorLabelType.hex],
                pickerAreaHeightPercent: 0.72,
                displayThumbColor: true,
                hexInputBar: true,
              ),
            );
          },
        );
      },
    );

    if (result != null && mounted) {
      setState(() => _colorHex = colorToHexString(result));
    }
  }
}
