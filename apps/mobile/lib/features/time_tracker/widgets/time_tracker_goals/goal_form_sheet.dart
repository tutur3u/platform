import 'package:flutter/material.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/data/models/time_tracking/category.dart';
import 'package:mobile/data/models/time_tracking/goal.dart';
import 'package:mobile/features/time_tracker/utils/category_color.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class GoalFormResult {
  const GoalFormResult({
    required this.dailyGoalMinutes,
    required this.weeklyGoalMinutes,
    required this.isActive,
    this.categoryId,
  });

  final String? categoryId;
  final int dailyGoalMinutes;
  final int? weeklyGoalMinutes;
  final bool isActive;
}

Future<GoalFormResult?> showGoalFormSheet(
  BuildContext context, {
  required List<TimeTrackingCategory> categories,
  required String title,
  required String saveLabel,
  TimeTrackingGoal? initialGoal,
}) {
  return showAdaptiveSheet<GoalFormResult>(
    context: context,
    builder: (sheetContext) => GoalFormSheet(
      categories: categories,
      title: title,
      saveLabel: saveLabel,
      initialGoal: initialGoal,
    ),
  );
}

class GoalFormSheet extends StatefulWidget {
  const GoalFormSheet({
    required this.categories,
    required this.title,
    required this.saveLabel,
    this.initialGoal,
    super.key,
  });

  final List<TimeTrackingCategory> categories;
  final String title;
  final String saveLabel;
  final TimeTrackingGoal? initialGoal;

  @override
  State<GoalFormSheet> createState() => _GoalFormSheetState();
}

class _GoalFormSheetState extends State<GoalFormSheet> {
  late final TextEditingController _dailyController;
  late final TextEditingController _weeklyController;
  late String _selectedCategory;
  late bool _isActive;
  String? _error;

  void _clearErrorOnInputChange() {
    if (_error == null) {
      return;
    }
    setState(() => _error = null);
  }

  @override
  void initState() {
    super.initState();
    final initialGoal = widget.initialGoal;
    _dailyController = TextEditingController(
      text: (initialGoal?.dailyGoalMinutes ?? 480).toString(),
    );
    _weeklyController = TextEditingController(
      text: initialGoal?.weeklyGoalMinutes?.toString() ?? '',
    );
    _dailyController.addListener(_clearErrorOnInputChange);
    _weeklyController.addListener(_clearErrorOnInputChange);
    _selectedCategory = initialGoal?.categoryId ?? 'general';
    _isActive = initialGoal?.isActive ?? true;
  }

  @override
  void dispose() {
    _dailyController.removeListener(_clearErrorOnInputChange);
    _weeklyController.removeListener(_clearErrorOnInputChange);
    _dailyController.dispose();
    _weeklyController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final selectedCategory = _selectedCategoryName(l10n);
    final selectedCategoryColor = _selectedCategoryColor(context, theme);

    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.background,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
      ),
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
          24,
          16,
          24,
          MediaQuery.of(context).viewInsets.bottom + 32,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: theme.colorScheme.mutedForeground.withValues(
                    alpha: 0.4,
                  ),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const shad.Gap(16),
            Text(
              widget.title,
              style: theme.typography.h4.copyWith(fontWeight: FontWeight.w600),
            ),
            const shad.Gap(12),
            Text(l10n.timerGoalsCategory),
            const shad.Gap(4),
            shad.OutlineButton(
              onPressed: _openCategoryPicker,
              alignment: Alignment.centerLeft,
              child: Row(
                children: [
                  Container(
                    width: 10,
                    height: 10,
                    decoration: BoxDecoration(
                      color: selectedCategoryColor,
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                  const shad.Gap(8),
                  Expanded(child: Text(selectedCategory)),
                ],
              ),
            ),
            const shad.Gap(12),
            Text(l10n.timerGoalsDailyMinutes),
            const shad.Gap(4),
            shad.TextField(
              controller: _dailyController,
              keyboardType: TextInputType.number,
              placeholder: const Text('480'),
            ),
            const shad.Gap(12),
            Text(l10n.timerGoalsWeeklyMinutesOptional),
            const shad.Gap(4),
            shad.TextField(
              controller: _weeklyController,
              keyboardType: TextInputType.number,
              placeholder: const Text('2400'),
            ),
            const shad.Gap(12),
            Row(
              children: [
                shad.Switch(
                  value: _isActive,
                  onChanged: (value) => setState(() => _isActive = value),
                ),
                const shad.Gap(8),
                Text(l10n.timerGoalsActiveLabel),
              ],
            ),
            if (_error != null) ...[
              const shad.Gap(8),
              Text(
                _error!,
                style: theme.typography.small.copyWith(
                  color: theme.colorScheme.destructive,
                ),
              ),
            ],
            const shad.Gap(16),
            Row(
              children: [
                Expanded(
                  child: shad.OutlineButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: Text(l10n.commonCancel),
                  ),
                ),
                const shad.Gap(8),
                Expanded(
                  child: shad.PrimaryButton(
                    onPressed: _submit,
                    child: Text(widget.saveLabel),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _openCategoryPicker() async {
    final selected = await showAdaptiveSheet<String>(
      context: context,
      builder: (sheetContext) => _CategoryPickerSheet(
        categories: widget.categories,
        selectedCategory: _selectedCategory,
      ),
    );
    if (selected == null || !mounted) {
      return;
    }
    setState(() => _selectedCategory = selected);
  }

  String _selectedCategoryName(AppLocalizations l10n) {
    if (_selectedCategory == 'general') {
      return l10n.timerGoalsGeneral;
    }
    for (final category in widget.categories) {
      if (category.id == _selectedCategory) {
        return category.name ?? l10n.timerNoCategory;
      }
    }
    return l10n.timerNoCategory;
  }

  Color _selectedCategoryColor(BuildContext context, shad.ThemeData theme) {
    if (_selectedCategory == 'general') {
      return theme.colorScheme.primary;
    }

    for (final category in widget.categories) {
      if (category.id == _selectedCategory) {
        return resolveTimeTrackingCategoryColor(
          context,
          category.color,
          fallback: theme.colorScheme.primary,
        );
      }
    }

    return theme.colorScheme.primary;
  }

  void _submit() {
    final l10n = context.l10n;
    final dailyGoalMinutes = int.tryParse(_dailyController.text.trim());
    if (dailyGoalMinutes == null || dailyGoalMinutes <= 0) {
      setState(() => _error = l10n.timerGoalsDailyValidation);
      return;
    }

    final weeklyText = _weeklyController.text.trim();
    final weeklyGoalMinutes = weeklyText.isEmpty
        ? null
        : int.tryParse(weeklyText);
    if (weeklyText.isNotEmpty &&
        (weeklyGoalMinutes == null || weeklyGoalMinutes <= 0)) {
      setState(() => _error = l10n.timerGoalsWeeklyValidation);
      return;
    }

    Navigator.of(context).pop(
      GoalFormResult(
        categoryId: _selectedCategory == 'general' ? null : _selectedCategory,
        dailyGoalMinutes: dailyGoalMinutes,
        weeklyGoalMinutes: weeklyGoalMinutes,
        isActive: _isActive,
      ),
    );
  }
}

class _CategoryPickerSheet extends StatelessWidget {
  const _CategoryPickerSheet({
    required this.categories,
    required this.selectedCategory,
  });

  final List<TimeTrackingCategory> categories;
  final String selectedCategory;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.background,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
      ),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
        shrinkWrap: true,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: theme.colorScheme.mutedForeground.withValues(alpha: 0.4),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const shad.Gap(16),
          Text(
            l10n.timerGoalsCategory,
            style: theme.typography.h4.copyWith(fontWeight: FontWeight.w600),
          ),
          const shad.Gap(12),
          shad.OutlineButton(
            onPressed: () => Navigator.of(context).pop('general'),
            alignment: Alignment.centerLeft,
            child: Row(
              children: [
                Expanded(child: Text(l10n.timerGoalsGeneral)),
                if (selectedCategory == 'general')
                  Icon(
                    shad.LucideIcons.check,
                    size: 16,
                    color: theme.colorScheme.foreground,
                  ),
              ],
            ),
          ),
          const shad.Gap(8),
          ...categories.map(
            (category) {
              final categoryColor = resolveTimeTrackingCategoryColor(
                context,
                category.color,
                fallback: theme.colorScheme.primary,
              );

              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: shad.OutlineButton(
                  onPressed: () => Navigator.of(context).pop(category.id),
                  alignment: Alignment.centerLeft,
                  child: Row(
                    children: [
                      Container(
                        width: 10,
                        height: 10,
                        decoration: BoxDecoration(
                          color: categoryColor,
                          borderRadius: BorderRadius.circular(999),
                        ),
                      ),
                      const shad.Gap(8),
                      Expanded(
                        child: Text(category.name ?? l10n.timerNoCategory),
                      ),
                      if (selectedCategory == category.id)
                        Icon(
                          shad.LucideIcons.check,
                          size: 16,
                          color: theme.colorScheme.foreground,
                        ),
                    ],
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}
