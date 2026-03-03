import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_colorpicker/flutter_colorpicker.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/icons/platform_icon.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/finance/category.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/async_delete_confirmation_dialog.dart';
import 'package:mobile/widgets/platform_icon_picker.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class TransactionCategoriesPage extends StatelessWidget {
  const TransactionCategoriesPage({super.key});

  @override
  Widget build(BuildContext context) {
    return RepositoryProvider(
      create: (_) => FinanceRepository(),
      child: const _TransactionCategoriesView(),
    );
  }
}

class _TransactionCategoriesView extends StatefulWidget {
  const _TransactionCategoriesView();

  @override
  State<_TransactionCategoriesView> createState() =>
      _TransactionCategoriesViewState();
}

class _TransactionCategoriesViewState
    extends State<_TransactionCategoriesView> {
  List<TransactionCategory> _categories = const [];
  bool _isLoading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    unawaited(_loadCategories());
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return shad.Scaffold(
      headers: [
        shad.AppBar(
          leading: [
            shad.OutlineButton(
              density: shad.ButtonDensity.icon,
              onPressed: () {
                final router = GoRouter.of(context);
                if (router.canPop()) {
                  router.pop();
                  return;
                }
                context.go(Routes.finance);
              },
              child: const Icon(Icons.arrow_back),
            ),
          ],
          title: Text(l10n.financeCategories),
          trailing: [
            shad.PrimaryButton(
              onPressed: _onCreate,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.add, size: 16),
                  const shad.Gap(4),
                  Text(l10n.financeCreateCategory),
                ],
              ),
            ),
          ],
        ),
      ],
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (prev, curr) =>
            prev.currentWorkspace?.id != curr.currentWorkspace?.id,
        listener: (context, state) => unawaited(_loadCategories()),
        child: RefreshIndicator(
          onRefresh: _loadCategories,
          child: _isLoading
              ? const Center(child: shad.CircularProgressIndicator())
              : _error != null
              ? ListView(
                  children: [
                    const SizedBox(height: 120),
                    Center(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 24),
                        child: Text(
                          _error!,
                          textAlign: TextAlign.center,
                          style: theme.typography.textMuted,
                        ),
                      ),
                    ),
                  ],
                )
              : _categories.isEmpty
              ? ListView(
                  children: [
                    const SizedBox(height: 120),
                    Center(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 24),
                        child: Text(
                          l10n.financeNoCategories,
                          textAlign: TextAlign.center,
                          style: theme.typography.textMuted,
                        ),
                      ),
                    ),
                  ],
                )
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                  itemCount: _categories.length,
                  separatorBuilder: (_, _) => const shad.Gap(8),
                  itemBuilder: (context, index) {
                    final category = _categories[index];
                    return _CategoryCard(
                      category: category,
                      onEdit: () => _onEdit(category),
                      onDelete: () => _onDelete(category),
                    );
                  },
                ),
        ),
      ),
    );
  }

  Future<void> _onCreate() async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    final changed = await _showCategoryDialog(wsId: wsId);
    if (changed) {
      await _loadCategories();
    }
  }

  Future<void> _onDelete(TransactionCategory category) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;

    final repository = context.read<FinanceRepository>();
    final l10n = context.l10n;
    final toastContext = context;

    await shad.showDialog<bool>(
      context: context,
      builder: (_) => AsyncDeleteConfirmationDialog(
        title: l10n.financeDeleteCategory,
        message: l10n.financeDeleteCategoryConfirm,
        cancelLabel: l10n.commonCancel,
        confirmLabel: l10n.financeDeleteCategory,
        toastContext: toastContext,
        onConfirm: () async {
          await repository.deleteCategory(
            wsId: wsId,
            categoryId: category.id,
          );
        },
      ),
    );

    if (!mounted) return;
    await _loadCategories();
  }

  Future<void> _onEdit(TransactionCategory category) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    final changed = await _showCategoryDialog(wsId: wsId, category: category);
    if (changed) {
      await _loadCategories();
    }
  }

  Future<void> _loadCategories() async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;

    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final categories = await context.read<FinanceRepository>().getCategories(
        wsId,
      );
      if (!mounted) return;
      setState(() => _categories = categories);
    } on Exception {
      if (!mounted) return;
      setState(() => _error = context.l10n.commonSomethingWentWrong);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<bool> _showCategoryDialog({
    required String wsId,
    TransactionCategory? category,
  }) async {
    final repository = context.read<FinanceRepository>();
    final createdOrUpdated = await shad.showDialog<bool>(
      context: context,
      builder: (_) => _CategoryDialog(
        wsId: wsId,
        category: category,
        repository: repository,
      ),
    );

    return createdOrUpdated ?? false;
  }
}

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
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _nameController;
  late bool _isExpense;
  String? _icon;
  String? _colorHex;
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.category?.name ?? '');
    _isExpense = widget.category?.isExpense ?? true;
    _icon = widget.category?.icon;
    _colorHex = _normalizeHex(widget.category?.color ?? '');
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final previewColor =
        _parseHexColor(_colorHex) ??
        (_isExpense
            ? shad.Theme.of(context).colorScheme.destructive
            : shad.Theme.of(context).colorScheme.primary);
    final previewIcon = resolvePlatformIcon(
      _icon,
      fallback: _isExpense ? Icons.arrow_downward : Icons.arrow_upward,
    );

    return shad.AlertDialog(
      title: Text(
        widget.category == null
            ? context.l10n.financeCreateCategory
            : context.l10n.financeEditCategory,
      ),
      content: Form(
        key: _formKey,
        child: SizedBox(
          width: double.maxFinite,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(context.l10n.timerCategoryName),
              const shad.Gap(4),
              TextFormField(
                controller: _nameController,
                autofocus: true,
                decoration: const InputDecoration(border: OutlineInputBorder()),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return context.l10n.financeCategoryNameRequired;
                  }
                  return null;
                },
              ),
              const shad.Gap(12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(10),
                  color: previewColor.withValues(alpha: 0.1),
                  border: Border.all(
                    color: previewColor.withValues(alpha: 0.35),
                  ),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 34,
                      height: 34,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: previewColor.withValues(alpha: 0.16),
                      ),
                      child: Icon(previewIcon, size: 16, color: previewColor),
                    ),
                    const shad.Gap(10),
                    Text(
                      context.l10n.financePreview,
                      style: shad.Theme.of(context).typography.small.copyWith(
                        color: shad.Theme.of(
                          context,
                        ).colorScheme.mutedForeground,
                      ),
                    ),
                  ],
                ),
              ),
              const shad.Gap(12),
              Text(context.l10n.financeType),
              const shad.Gap(4),
              Row(
                children: [
                  Expanded(
                    child: _isExpense
                        ? shad.PrimaryButton(
                            onPressed: () => setState(() => _isExpense = true),
                            child: Text(context.l10n.financeExpense),
                          )
                        : shad.OutlineButton(
                            onPressed: () => setState(() => _isExpense = true),
                            child: Text(context.l10n.financeExpense),
                          ),
                  ),
                  const shad.Gap(8),
                  Expanded(
                    child: !_isExpense
                        ? shad.PrimaryButton(
                            onPressed: () => setState(() => _isExpense = false),
                            child: Text(context.l10n.financeIncome),
                          )
                        : shad.OutlineButton(
                            onPressed: () => setState(() => _isExpense = false),
                            child: Text(context.l10n.financeIncome),
                          ),
                  ),
                ],
              ),
              const shad.Gap(12),
              Text(context.l10n.financeIcon),
              const shad.Gap(4),
              PlatformIconPickerField(
                value: _icon,
                title: context.l10n.financeSelectIcon,
                searchPlaceholder: context.l10n.financeSearchIcons,
                emptyText: context.l10n.financeNoIconsFound,
                showLabel: false,
                onChanged: (value) => setState(() => _icon = value),
              ),
              const shad.Gap(12),
              Text(context.l10n.calendarEventColor),
              const shad.Gap(4),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 24,
                        height: 24,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: previewColor,
                        ),
                      ),
                      const shad.Gap(8),
                      Expanded(
                        child: Text(
                          _colorHex ?? context.l10n.financeNoColor,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: shad.Theme.of(context).typography.small
                              .copyWith(
                                color: shad.Theme.of(
                                  context,
                                ).colorScheme.mutedForeground,
                              ),
                        ),
                      ),
                    ],
                  ),
                  const shad.Gap(8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      shad.OutlineButton(
                        onPressed: _openColorPicker,
                        child: Text(context.l10n.financePickColor),
                      ),
                      shad.OutlineButton(
                        onPressed: () =>
                            setState(() => _colorHex = _randomHexColor()),
                        child: Text(context.l10n.financeRandomizeColor),
                      ),
                      if (_colorHex != null)
                        shad.GhostButton(
                          density: shad.ButtonDensity.icon,
                          onPressed: () => setState(() => _colorHex = null),
                          child: const Icon(Icons.close, size: 14),
                        ),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
      actions: [
        shad.OutlineButton(
          onPressed: _isSaving ? null : () => Navigator.of(context).pop(false),
          child: Text(context.l10n.commonCancel),
        ),
        shad.PrimaryButton(
          onPressed: _isSaving ? null : _saveCategory,
          child: _isSaving
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: shad.CircularProgressIndicator(),
                )
              : Text(
                  widget.category == null
                      ? context.l10n.financeCreateCategory
                      : context.l10n.timerSave,
                ),
        ),
      ],
    );
  }

  Future<void> _saveCategory() async {
    if (!(_formKey.currentState?.validate() ?? false)) {
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

  String? _normalizeHex(String raw) {
    if (raw.trim().isEmpty) return null;
    final value = raw.trim().replaceFirst('#', '');
    if (value.length != 6 && value.length != 8) {
      return null;
    }
    final parsed = int.tryParse(value, radix: 16);
    if (parsed == null) {
      return null;
    }
    if (value.length == 8) {
      return '#${value.substring(2)}'.toUpperCase();
    }
    return '#${value.toUpperCase()}';
  }

  String _randomHexColor() {
    final rng = Random();
    final hue = rng.nextInt(360).toDouble();
    final saturation = (55 + rng.nextInt(36)).toDouble() / 100;
    final lightness = (42 + rng.nextInt(24)).toDouble() / 100;
    final color = HSLColor.fromAHSL(1, hue, saturation, lightness).toColor();
    return _toHex(color);
  }

  Future<void> _openColorPicker() async {
    var selected =
        _parseHexColor(_colorHex) ??
        (_isExpense
            ? shad.Theme.of(context).colorScheme.destructive
            : shad.Theme.of(context).colorScheme.primary);

    final result = await shad.showDialog<Color>(
      context: context,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return shad.AlertDialog(
              title: Text(context.l10n.financePickColor),
              content: SizedBox(
                width: 320,
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
              ),
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
            );
          },
        );
      },
    );

    if (result != null && mounted) {
      setState(() => _colorHex = _toHex(result));
    }
  }

  String _toHex(Color color) {
    final r = (color.r * 255).round().toRadixString(16).padLeft(2, '0');
    final g = (color.g * 255).round().toRadixString(16).padLeft(2, '0');
    final b = (color.b * 255).round().toRadixString(16).padLeft(2, '0');
    return '#$r$g$b'.toUpperCase();
  }

  Color? _parseHexColor(String? hex) {
    if (hex == null || hex.trim().isEmpty) return null;
    final cleaned = hex.trim().replaceFirst('#', '');
    if (cleaned.length != 6 && cleaned.length != 8) return null;
    final value = int.tryParse(
      cleaned.length == 6 ? 'FF$cleaned' : cleaned,
      radix: 16,
    );
    return value != null ? Color(value) : null;
  }
}

class _CategoryCard extends StatelessWidget {
  const _CategoryCard({
    required this.category,
    required this.onEdit,
    required this.onDelete,
  });

  final TransactionCategory category;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final isExpense = category.isExpense != false;
    final baseColor = isExpense
        ? theme.colorScheme.destructive
        : theme.colorScheme.primary;
    final color = _parseHex(category.color) ?? baseColor;
    final icon = resolvePlatformIcon(
      category.icon,
      fallback: isExpense ? Icons.arrow_downward : Icons.arrow_upward,
    );

    return shad.Card(
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: color.withValues(alpha: 0.16),
            ),
            child: Icon(icon, size: 16, color: color),
          ),
          const shad.Gap(12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  category.name ?? '-',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.p.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const shad.Gap(2),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 6,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(999),
                        color: color.withValues(alpha: 0.12),
                      ),
                      child: Text(
                        isExpense
                            ? context.l10n.financeExpense
                            : context.l10n.financeIncome,
                        style: theme.typography.xSmall.copyWith(
                          color: color,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    if (category.transactionCount != null) ...[
                      const shad.Gap(8),
                      Text(
                        '${category.transactionCount} '
                        '${context.l10n.financeTransactionCountShort}',
                        style: theme.typography.xSmall.copyWith(
                          color: theme.colorScheme.mutedForeground,
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
          shad.GhostButton(
            density: shad.ButtonDensity.icon,
            onPressed: onEdit,
            child: const Icon(Icons.edit_outlined, size: 16),
          ),
          shad.GhostButton(
            density: shad.ButtonDensity.icon,
            onPressed: onDelete,
            child: const Icon(Icons.delete_outline, size: 16),
          ),
        ],
      ),
    );
  }

  Color? _parseHex(String? hex) {
    if (hex == null) return null;
    final cleaned = hex.replaceFirst('#', '');
    if (cleaned.length != 6 && cleaned.length != 8) return null;
    final value = int.tryParse(
      cleaned.length == 6 ? 'FF$cleaned' : cleaned,
      radix: 16,
    );
    return value != null ? Color(value) : null;
  }
}
