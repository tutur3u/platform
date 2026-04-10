import 'package:flutter/material.dart';
import 'package:mobile/data/models/habit_tracker.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/finance/widgets/finance_modal_scaffold.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/habits/habit_tracker_presentation.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class HabitTrackerFormSheet extends StatefulWidget {
  const HabitTrackerFormSheet({
    required this.onSubmit,
    super.key,
    this.tracker,
    this.initialTemplateId,
  });

  final HabitTracker? tracker;
  final String? initialTemplateId;
  final Future<void> Function(HabitTrackerInput input) onSubmit;

  @override
  State<HabitTrackerFormSheet> createState() => _HabitTrackerFormSheetState();
}

class HabitTrackerFieldDraft {
  HabitTrackerFieldDraft({
    required this.label,
    required this.key,
    required this.type,
    this.unit = '',
    this.required = false,
    this.optionsText = '',
    this.manualKey = false,
  });

  factory HabitTrackerFieldDraft.fromSchema(HabitTrackerFieldSchema schema) {
    return HabitTrackerFieldDraft(
      label: schema.label,
      key: schema.key,
      type: schema.type,
      unit: schema.unit ?? '',
      required: schema.required,
      optionsText: schema.options.map((value) => value.value).join(', '),
    );
  }

  final String label;
  final String key;
  final HabitTrackerFieldType type;
  final String unit;
  final bool required;
  final String optionsText;
  final bool manualKey;

  HabitTrackerFieldSchema toSchema() {
    return HabitTrackerFieldSchema(
      key: key.trim(),
      label: label.trim(),
      type: type,
      unit: unit.trim().isEmpty ? null : unit.trim(),
      required: required,
      options: type == HabitTrackerFieldType.select
          ? optionsText
                .split(',')
                .map((value) => value.trim())
                .where((value) => value.isNotEmpty)
                .map(
                  (value) => HabitTrackerFieldOption(
                    label: value,
                    value: value.toLowerCase().replaceAll(' ', '_'),
                  ),
                )
                .toList(growable: false)
          : const [],
    );
  }

  HabitTrackerFieldDraft copyWith({
    String? label,
    String? key,
    HabitTrackerFieldType? type,
    String? unit,
    bool? required,
    String? optionsText,
    bool? manualKey,
  }) {
    return HabitTrackerFieldDraft(
      label: label ?? this.label,
      key: key ?? this.key,
      type: type ?? this.type,
      unit: unit ?? this.unit,
      required: required ?? this.required,
      optionsText: optionsText ?? this.optionsText,
      manualKey: manualKey ?? this.manualKey,
    );
  }
}

class _HabitTrackerFormSheetState extends State<HabitTrackerFormSheet> {
  late final TextEditingController _nameController;
  late final TextEditingController _descriptionController;
  late final TextEditingController _targetValueController;
  late final TextEditingController _quickAddController;
  late final TextEditingController _freezeAllowanceController;
  late final TextEditingController _recoveryWindowController;
  late final TextEditingController _startDateController;
  late HabitTrackerTrackingMode _trackingMode;
  late HabitTrackerTargetPeriod _targetPeriod;
  late HabitTrackerTargetOperator _targetOperator;
  late HabitTrackerAggregationStrategy _aggregationStrategy;
  late String _selectedColor;
  late String _selectedIcon;
  late String _primaryMetricKey;
  late bool _isActive;
  late HabitTrackerUseCase _useCase;
  late HabitTrackerTemplateCategory _templateCategory;
  late HabitTrackerComposerMode _composerMode;
  late HabitTrackerComposerConfig _composerConfig;
  late List<HabitTrackerFieldDraft> _fields;
  String _selectedTemplateId = 'custom';
  bool _showAdvancedFields = false;
  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    final tracker = widget.tracker;
    final selectedTemplateId = widget.initialTemplateId ?? 'body_weight';
    final initialInput = tracker == null
        ? (habitTrackerTemplateById(selectedTemplateId)?.toInput(
                startDate: DateTime.now().toIso8601String().slice(0, 10),
              ) ??
              habitTrackerTemplates.first.toInput(
                startDate: DateTime.now().toIso8601String().slice(0, 10),
              ))
        : HabitTrackerInput(
            name: tracker.name,
            description: tracker.description,
            color: tracker.color,
            icon: tracker.icon,
            trackingMode: tracker.trackingMode,
            targetPeriod: tracker.targetPeriod,
            targetOperator: tracker.targetOperator,
            targetValue: tracker.targetValue,
            primaryMetricKey: tracker.primaryMetricKey,
            aggregationStrategy: tracker.aggregationStrategy,
            inputSchema: tracker.inputSchema,
            quickAddValues: tracker.quickAddValues,
            freezeAllowance: tracker.freezeAllowance,
            recoveryWindowPeriods: tracker.recoveryWindowPeriods,
            useCase: tracker.useCase,
            templateCategory: tracker.templateCategory,
            composerMode: tracker.composerMode,
            composerConfig: tracker.composerConfig,
            startDate: tracker.startDate,
            isActive: tracker.isActive,
          );
    _nameController = TextEditingController(text: initialInput.name);
    _descriptionController = TextEditingController(
      text: initialInput.description ?? '',
    );
    _targetValueController = TextEditingController(
      text: formatCompactNumber(initialInput.targetValue),
    );
    _quickAddController = TextEditingController(
      text: initialInput.quickAddValues.map(formatCompactNumber).join(', '),
    );
    _freezeAllowanceController = TextEditingController(
      text: initialInput.freezeAllowance.toString(),
    );
    _recoveryWindowController = TextEditingController(
      text: initialInput.recoveryWindowPeriods.toString(),
    );
    _startDateController = TextEditingController(
      text:
          initialInput.startDate ??
          DateTime.now().toIso8601String().slice(0, 10),
    );
    _trackingMode = initialInput.trackingMode;
    _targetPeriod = initialInput.targetPeriod;
    _targetOperator = initialInput.targetOperator;
    _aggregationStrategy = initialInput.aggregationStrategy;
    _selectedColor = initialInput.color;
    _selectedIcon = initialInput.icon;
    _primaryMetricKey = initialInput.primaryMetricKey;
    _isActive = initialInput.isActive;
    _useCase = initialInput.useCase;
    _templateCategory = initialInput.templateCategory;
    _composerMode = initialInput.composerMode;
    _composerConfig = initialInput.composerConfig;
    _fields = initialInput.inputSchema
        .map(HabitTrackerFieldDraft.fromSchema)
        .toList(growable: true);
    _selectedTemplateId = tracker?.id ?? selectedTemplateId;
    _showAdvancedFields = tracker != null || selectedTemplateId == 'custom';
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descriptionController.dispose();
    _targetValueController.dispose();
    _quickAddController.dispose();
    _freezeAllowanceController.dispose();
    _recoveryWindowController.dispose();
    _startDateController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final previewTrackerName = _nameController.text.trim().isEmpty
        ? (widget.tracker == null
              ? (habitTrackerTemplateById(_selectedTemplateId)?.name ??
                    l10n.habitsCreateTrackerTitle)
              : widget.tracker!.name)
        : _nameController.text.trim();
    final previewUnit = (() {
      for (final field in _fields) {
        if (field.key == _primaryMetricKey) {
          return field.unit;
        }
      }
      return _composerConfig.unit;
    })();

    return FinanceFullscreenFormScaffold(
      title: widget.tracker == null
          ? l10n.habitsCreateTrackerTitle
          : l10n.habitsEditTrackerTitle,
      subtitle: widget.tracker == null
          ? l10n.habitsCreateTrackerDescription
          : l10n.habitsEditTrackerDescription,
      primaryActionLabel: widget.tracker == null
          ? l10n.habitsCreateTrackerAction
          : l10n.habitsSaveTrackerAction,
      onPrimaryPressed: _isSubmitting ? null : _submit,
      onClose: _isSubmitting ? null : () => Navigator.of(context).maybePop(),
      isSaving: _isSubmitting,
      child: ListView(
        children: [
          _FormPreviewCard(
            trackerName: previewTrackerName,
            description: _descriptionController.text.trim(),
            color: _selectedColor,
            icon: _selectedIcon,
            targetValue: _targetValueController.text.trim(),
            unit: previewUnit,
            composerMode: _composerMode,
            targetPeriod: _targetPeriod,
          ),
          if (widget.tracker == null) ...[
            const SizedBox(height: 12),
            _FormSectionPanel(
              title: l10n.habitsTemplateLabel,
              subtitle: l10n.habitsCreateTrackerDescription,
              child: _TemplateChooser(
                selectedTemplateId: _selectedTemplateId,
                onSelected: _applyTemplate,
              ),
            ),
          ],
          const SizedBox(height: 12),
          _FormSectionPanel(
            title: l10n.habitsNameLabel,
            subtitle: widget.tracker == null
                ? l10n.habitsCreateTrackerDescription
                : l10n.habitsEditTrackerDescription,
            child: Column(
              children: [
                _LabeledField(
                  label: l10n.habitsNameLabel,
                  child: TextField(
                    controller: _nameController,
                    onChanged: (_) => setState(() {}),
                  ),
                ),
                const SizedBox(height: 14),
                _LabeledField(
                  label: l10n.habitsDescriptionLabel,
                  child: TextField(
                    controller: _descriptionController,
                    minLines: 2,
                    maxLines: 4,
                    onChanged: (_) => setState(() {}),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          _FormSectionPanel(
            title: l10n.habitsTargetValueLabel,
            subtitle: l10n.habitsQuickAddValuesLabel,
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: _LabeledField(
                        label: l10n.habitsTargetValueLabel,
                        child: TextField(
                          controller: _targetValueController,
                          keyboardType: const TextInputType.numberWithOptions(
                            decimal: true,
                          ),
                          onChanged: (_) => setState(() {}),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _LabeledField(
                        label: l10n.habitsStartDateLabel,
                        child: TextField(
                          controller: _startDateController,
                          readOnly: true,
                          onTap: _pickDate,
                          decoration: const InputDecoration(
                            suffixIcon: Icon(
                              Icons.calendar_today_outlined,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(
                      child: _DropdownField<HabitTrackerTargetPeriod>(
                        label: l10n.habitsTargetPeriodLabel,
                        value: _targetPeriod,
                        items: HabitTrackerTargetPeriod.values
                            .map(
                              (value) => DropdownMenuItem(
                                value: value,
                                child: Text(
                                  value == HabitTrackerTargetPeriod.daily
                                      ? l10n.habitsPeriodDaily
                                      : l10n.habitsPeriodWeekly,
                                ),
                              ),
                            )
                            .toList(growable: false),
                        onChanged: (value) {
                          if (value != null) {
                            setState(() => _targetPeriod = value);
                          }
                        },
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _DropdownField<HabitTrackerTargetOperator>(
                        label: l10n.habitsTargetOperatorLabel,
                        value: _targetOperator,
                        items: HabitTrackerTargetOperator.values
                            .map(
                              (value) => DropdownMenuItem(
                                value: value,
                                child: Text(
                                  value == HabitTrackerTargetOperator.eq
                                      ? l10n.habitsTargetOperatorEq
                                      : l10n.habitsTargetOperatorGte,
                                ),
                              ),
                            )
                            .toList(growable: false),
                        onChanged: (value) {
                          if (value != null) {
                            setState(() => _targetOperator = value);
                          }
                        },
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                _LabeledField(
                  label: l10n.habitsQuickAddValuesLabel,
                  child: TextField(
                    controller: _quickAddController,
                    decoration: InputDecoration(
                      hintText: l10n.habitsQuickAddValuesHint,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          _FormSectionPanel(
            title: l10n.habitsTrackingModeLabel,
            subtitle: l10n.habitsAppearanceLabel,
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: _DropdownField<HabitTrackerTrackingMode>(
                        label: l10n.habitsTrackingModeLabel,
                        value: _trackingMode,
                        items: HabitTrackerTrackingMode.values
                            .map(
                              (value) => DropdownMenuItem(
                                value: value,
                                child: Text(
                                  value == HabitTrackerTrackingMode.dailySummary
                                      ? l10n.habitsModeDailySummary
                                      : l10n.habitsModeEventLog,
                                ),
                              ),
                            )
                            .toList(growable: false),
                        onChanged: (value) {
                          if (value != null) {
                            setState(() => _trackingMode = value);
                          }
                        },
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _DropdownField<HabitTrackerAggregationStrategy>(
                        label: l10n.habitsAggregationLabel,
                        value: _aggregationStrategy,
                        items: HabitTrackerAggregationStrategy.values
                            .map(
                              (value) => DropdownMenuItem(
                                value: value,
                                child: Text(
                                  _aggregationLabel(
                                    context,
                                    value,
                                  ),
                                ),
                              ),
                            )
                            .toList(growable: false),
                        onChanged: (value) {
                          if (value != null) {
                            setState(
                              () => _aggregationStrategy = value,
                            );
                          }
                        },
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                _LabeledField(
                  label: l10n.habitsIconLabel,
                  child: DropdownButtonFormField<String>(
                    initialValue: _selectedIcon,
                    items: habitTrackerIconOptions
                        .map(
                          (value) => DropdownMenuItem<String>(
                            value: value,
                            child: Row(
                              children: [
                                Icon(habitTrackerIcon(value)),
                                const SizedBox(width: 8),
                                Text(value),
                              ],
                            ),
                          ),
                        )
                        .toList(growable: false),
                    onChanged: (value) {
                      if (value != null) {
                        setState(() => _selectedIcon = value);
                      }
                    },
                  ),
                ),
                const SizedBox(height: 14),
                _LabeledField(
                  label: l10n.habitsAppearanceLabel,
                  child: _ColorChooser(
                    selectedColor: _selectedColor,
                    onSelected: (value) =>
                        setState(() => _selectedColor = value),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          _FormSectionPanel(
            title: l10n.habitsFreezeAllowanceLabel,
            subtitle: l10n.habitsRecoveryWindowLabel,
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: _LabeledField(
                        label: l10n.habitsFreezeAllowanceLabel,
                        child: TextField(
                          controller: _freezeAllowanceController,
                          keyboardType: TextInputType.number,
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _LabeledField(
                        label: l10n.habitsRecoveryWindowLabel,
                        child: TextField(
                          controller: _recoveryWindowController,
                          keyboardType: TextInputType.number,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                SwitchListTile.adaptive(
                  contentPadding: EdgeInsets.zero,
                  title: Text(l10n.habitsActiveLabel),
                  value: _isActive,
                  onChanged: (value) {
                    setState(() => _isActive = value);
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          _FormSectionPanel(
            title: l10n.habitsFieldsTitle,
            subtitle: l10n.habitsPrimaryMetricLabel,
            action: shad.OutlineButton(
              onPressed: () {
                setState(
                  () => _showAdvancedFields = !_showAdvancedFields,
                );
              },
              child: Text(
                _showAdvancedFields
                    ? context.l10n.commonShowLess
                    : context.l10n.commonShowMore,
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _DropdownField<String>(
                  label: l10n.habitsPrimaryMetricLabel,
                  value: _primaryMetricKey,
                  items: _fields
                      .map(
                        (field) => DropdownMenuItem<String>(
                          value: field.key,
                          child: Text(
                            field.label.trim().isEmpty
                                ? field.key
                                : field.label,
                          ),
                        ),
                      )
                      .toList(growable: false),
                  onChanged: (value) {
                    if (value != null) {
                      setState(() => _primaryMetricKey = value);
                    }
                  },
                ),
                if (_showAdvancedFields) ...[
                  const SizedBox(height: 14),
                  for (var index = 0; index < _fields.length; index++) ...[
                    _FieldDraftCard(
                      draft: _fields[index],
                      index: index,
                      onChanged: (next) {
                        setState(() {
                          _fields[index] = next;
                          if (!next.manualKey) {
                            _fields[index] = _fields[index].copyWith(
                              key: slugifyHabitFieldKey(
                                next.label,
                              ),
                            );
                          }
                          if (!_fields.any(
                            (field) => field.key == _primaryMetricKey,
                          )) {
                            _primaryMetricKey = _fields[index].key;
                          }
                        });
                      },
                      onRemove: _fields.length == 1
                          ? null
                          : () {
                              setState(() {
                                final removedKey = _fields[index].key;
                                _fields.removeAt(index);
                                if (_primaryMetricKey == removedKey &&
                                    _fields.isNotEmpty) {
                                  _primaryMetricKey = _fields.first.key;
                                }
                              });
                            },
                    ),
                    if (index != _fields.length - 1) const SizedBox(height: 12),
                  ],
                  const SizedBox(height: 14),
                  shad.OutlineButton(
                    onPressed: _fields.length >= 4 ? null : _addField,
                    child: Text(l10n.habitsAddField),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Future<void> _pickDate() async {
    final current =
        DateTime.tryParse(_startDateController.text) ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: current,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (picked != null) {
      _startDateController.text = picked.toIso8601String().slice(0, 10);
    }
  }

  void _applyTemplate(String templateId) {
    final template = habitTrackerTemplateById(templateId);
    if (template == null) {
      return;
    }
    setState(() {
      _selectedTemplateId = templateId;
      _nameController.text = template.name;
      _descriptionController.text = template.description;
      _targetValueController.text = formatCompactNumber(template.targetValue);
      _quickAddController.text = template.quickAddValues
          .map(formatCompactNumber)
          .join(', ');
      _freezeAllowanceController.text = template.freezeAllowance.toString();
      _recoveryWindowController.text = template.recoveryWindowPeriods
          .toString();
      _trackingMode = template.trackingMode;
      _targetPeriod = template.targetPeriod;
      _targetOperator = template.targetOperator;
      _aggregationStrategy = template.aggregationStrategy;
      _selectedColor = template.color;
      _selectedIcon = template.icon;
      _primaryMetricKey = template.primaryMetricKey;
      _useCase = template.useCase;
      _templateCategory = template.templateCategory;
      _composerMode = template.composerMode;
      _composerConfig = template.composerConfig;
      _fields = template.inputSchema
          .map(HabitTrackerFieldDraft.fromSchema)
          .toList(growable: true);
    });
  }

  void _addField() {
    final index = _fields.length + 1;
    setState(() {
      _fields.add(
        HabitTrackerFieldDraft(
          label: 'Field $index',
          key: 'field_$index',
          type: HabitTrackerFieldType.number,
        ),
      );
      _primaryMetricKey = _fields.first.key;
    });
  }

  Future<void> _submit() async {
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      _showErrorToast(toastContext, context.l10n.habitsNameRequired);
      return;
    }

    final targetValue = double.tryParse(_targetValueController.text.trim());
    if (targetValue == null || targetValue <= 0) {
      _showErrorToast(toastContext, context.l10n.habitsTargetValueRequired);
      return;
    }

    if (_fields.isEmpty) {
      _showErrorToast(toastContext, context.l10n.habitsFieldsRequired);
      return;
    }

    final schemas = <HabitTrackerFieldSchema>[];
    final seenKeys = <String>{};
    for (final field in _fields) {
      final key = field.key.trim();
      final label = field.label.trim();
      if (key.isEmpty || label.isEmpty) {
        _showErrorToast(toastContext, context.l10n.habitsFieldsRequired);
        return;
      }
      if (seenKeys.contains(key)) {
        _showErrorToast(toastContext, context.l10n.habitsFieldKeysUnique);
        return;
      }
      if (field.type == HabitTrackerFieldType.select &&
          field.optionsText
              .split(',')
              .map((value) => value.trim())
              .where((value) => value.isNotEmpty)
              .isEmpty) {
        _showErrorToast(toastContext, context.l10n.habitsSelectOptionsRequired);
        return;
      }
      seenKeys.add(key);
      schemas.add(field.toSchema());
    }

    if (!seenKeys.contains(_primaryMetricKey)) {
      _showErrorToast(toastContext, context.l10n.habitsPrimaryMetricRequired);
      return;
    }

    final quickAddValues = normalizeQuickAddValues(
      _quickAddController.text
          .split(',')
          .map((value) => double.tryParse(value.trim()))
          .whereType<double>(),
    );

    final freezeAllowance =
        int.tryParse(_freezeAllowanceController.text.trim()) ?? 0;
    final recoveryWindow =
        int.tryParse(_recoveryWindowController.text.trim()) ?? 0;

    setState(() => _isSubmitting = true);
    try {
      await widget.onSubmit(
        HabitTrackerInput(
          name: name,
          description: _descriptionController.text.trim().isEmpty
              ? null
              : _descriptionController.text.trim(),
          color: _selectedColor,
          icon: _selectedIcon,
          trackingMode: _trackingMode,
          targetPeriod: _targetPeriod,
          targetOperator: _targetOperator,
          targetValue: targetValue,
          primaryMetricKey: _primaryMetricKey,
          aggregationStrategy: _aggregationStrategy,
          inputSchema: schemas,
          quickAddValues: quickAddValues,
          freezeAllowance: freezeAllowance,
          recoveryWindowPeriods: recoveryWindow,
          useCase: _useCase,
          templateCategory: _templateCategory,
          composerMode: _composerMode,
          composerConfig: _composerConfig,
          startDate: _startDateController.text.trim(),
          isActive: _isActive,
        ),
      );
      if (!mounted) return;
      await Navigator.of(context).maybePop();
    } on ApiException catch (error) {
      if (toastContext.mounted) {
        _showErrorToast(toastContext, error.message);
      }
    } on Exception {
      if (toastContext.mounted) {
        _showErrorToast(
          toastContext,
          toastContext.l10n.commonSomethingWentWrong,
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  String _aggregationLabel(
    BuildContext context,
    HabitTrackerAggregationStrategy strategy,
  ) {
    final l10n = context.l10n;
    return switch (strategy) {
      HabitTrackerAggregationStrategy.sum => l10n.habitsAggregationSum,
      HabitTrackerAggregationStrategy.max => l10n.habitsAggregationMax,
      HabitTrackerAggregationStrategy.countEntries =>
        l10n.habitsAggregationCountEntries,
      HabitTrackerAggregationStrategy.booleanAny =>
        l10n.habitsAggregationBooleanAny,
    };
  }

  void _showErrorToast(BuildContext toastContext, String message) {
    shad.showToast(
      context: toastContext,
      builder: (toastContext, overlay) =>
          shad.Alert.destructive(content: Text(message)),
    );
  }
}

class _FormPreviewCard extends StatelessWidget {
  const _FormPreviewCard({
    required this.trackerName,
    required this.description,
    required this.color,
    required this.icon,
    required this.targetValue,
    required this.unit,
    required this.composerMode,
    required this.targetPeriod,
  });

  final String trackerName;
  final String description;
  final String color;
  final String icon;
  final String targetValue;
  final String? unit;
  final HabitTrackerComposerMode composerMode;
  final HabitTrackerTargetPeriod targetPeriod;

  @override
  Widget build(BuildContext context) {
    final accent = habitTrackerColor(context, color);
    final palette = FinancePalette.of(context);
    final formattedTarget = targetValue.trim().isEmpty ? '0' : targetValue;
    final suffix = unit?.trim().isNotEmpty == true ? ' ${unit!.trim()}' : '';

    return FinancePanel(
      backgroundColor: accent.withValues(alpha: 0.08),
      borderColor: accent.withValues(alpha: 0.26),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(16),
                  color: accent.withValues(alpha: 0.16),
                ),
                child: Icon(habitTrackerIcon(icon), color: accent),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      trackerName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: shad.Theme.of(context).typography.large.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    if (description.trim().isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        description.trim(),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: shad.Theme.of(context).typography.textSmall
                            .copyWith(
                              color: shad.Theme.of(
                                context,
                              ).colorScheme.mutedForeground,
                            ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FinanceStatChip(
                label: context.l10n.habitsTargetValueLabel,
                value: '$formattedTarget$suffix',
                tint: accent,
              ),
              FinanceStatChip(
                label: context.l10n.habitsTrackingModeLabel,
                value: switch (composerMode) {
                  HabitTrackerComposerMode.quickCheck =>
                    context.l10n.habitsComposerQuickCheck,
                  HabitTrackerComposerMode.quickIncrement =>
                    context.l10n.habitsComposerQuickIncrement,
                  HabitTrackerComposerMode.measurement =>
                    context.l10n.habitsComposerMeasurement,
                  HabitTrackerComposerMode.workoutSession =>
                    context.l10n.habitsComposerWorkoutSession,
                  HabitTrackerComposerMode.advancedCustom =>
                    context.l10n.habitsComposerAdvancedCustom,
                },
                tint: palette.accent,
              ),
              FinanceStatChip(
                label: context.l10n.habitsTargetPeriodLabel,
                value: targetPeriod == HabitTrackerTargetPeriod.daily
                    ? context.l10n.habitsPeriodDaily
                    : context.l10n.habitsPeriodWeekly,
                tint: palette.positive,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _FormSectionPanel extends StatelessWidget {
  const _FormSectionPanel({
    required this.title,
    required this.child,
    this.subtitle,
    this.action,
  });

  final String title;
  final String? subtitle;
  final Widget child;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return FinancePanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          FinanceSectionHeader(
            title: title,
            subtitle: subtitle,
            action: action,
          ),
          const SizedBox(height: 16),
          child,
        ],
      ),
    );
  }
}

class _LabeledField extends StatelessWidget {
  const _LabeledField({required this.label, required this.child});

  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: Theme.of(
            context,
          ).textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 8),
        child,
      ],
    );
  }
}

class _DropdownField<T> extends StatelessWidget {
  const _DropdownField({
    required this.label,
    required this.value,
    required this.items,
    required this.onChanged,
  });

  final String label;
  final T value;
  final List<DropdownMenuItem<T>> items;
  final ValueChanged<T?> onChanged;

  @override
  Widget build(BuildContext context) {
    return _LabeledField(
      label: label,
      child: DropdownButtonFormField<T>(
        initialValue: value,
        items: items,
        onChanged: onChanged,
      ),
    );
  }
}

class _TemplateChooser extends StatelessWidget {
  const _TemplateChooser({
    required this.selectedTemplateId,
    required this.onSelected,
  });

  final String selectedTemplateId;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxWidth < 640;
        final itemWidth = compact
            ? constraints.maxWidth
            : (constraints.maxWidth - 12) / 2;

        return Wrap(
          spacing: 12,
          runSpacing: 12,
          children: habitTrackerTemplates
              .map((template) {
                final selected = template.id == selectedTemplateId;
                final accent = habitTrackerColor(context, template.color);
                return SizedBox(
                  width: itemWidth,
                  child: Material(
                    color: selected
                        ? accent.withValues(alpha: 0.09)
                        : Colors.transparent,
                    borderRadius: BorderRadius.circular(22),
                    child: InkWell(
                      onTap: () => onSelected(template.id),
                      borderRadius: BorderRadius.circular(22),
                      child: Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(22),
                          border: Border.all(
                            color: selected
                                ? accent.withValues(alpha: 0.34)
                                : Theme.of(
                                    context,
                                  ).colorScheme.outlineVariant.withValues(
                                    alpha: 0.7,
                                  ),
                          ),
                        ),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(
                              width: 42,
                              height: 42,
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(14),
                                color: accent.withValues(alpha: 0.14),
                              ),
                              child: Icon(
                                habitTrackerIcon(template.icon),
                                color: accent,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Expanded(
                                        child: Text(
                                          template.name,
                                          style: Theme.of(context)
                                              .textTheme
                                              .titleSmall
                                              ?.copyWith(
                                                fontWeight: FontWeight.w800,
                                              ),
                                        ),
                                      ),
                                      if (selected)
                                        Icon(
                                          Icons.check_circle_rounded,
                                          size: 18,
                                          color: accent,
                                        ),
                                    ],
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    template.description,
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: Theme.of(
                                      context,
                                    ).textTheme.bodySmall,
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                );
              })
              .toList(growable: false),
        );
      },
    );
  }
}

class _ColorChooser extends StatelessWidget {
  const _ColorChooser({required this.selectedColor, required this.onSelected});

  final String selectedColor;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: habitTrackerColorOptions
          .map((color) {
            final selected = color == selectedColor;
            return GestureDetector(
              onTap: () => onSelected(color),
              child: Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: habitTrackerColor(context, color),
                  border: Border.all(
                    color: selected ? Colors.black : Colors.transparent,
                    width: 2,
                  ),
                ),
                child: selected
                    ? const Icon(Icons.check, size: 18, color: Colors.white)
                    : null,
              ),
            );
          })
          .toList(growable: false),
    );
  }
}

class _FieldDraftCard extends StatelessWidget {
  const _FieldDraftCard({
    required this.draft,
    required this.index,
    required this.onChanged,
    this.onRemove,
  });

  final HabitTrackerFieldDraft draft;
  final int index;
  final ValueChanged<HabitTrackerFieldDraft> onChanged;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.black12),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  context.l10n.habitsFieldCardTitle(index + 1),
                  style: Theme.of(
                    context,
                  ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              if (onRemove != null)
                IconButton(
                  onPressed: onRemove,
                  icon: const Icon(Icons.delete_outline),
                ),
            ],
          ),
          const SizedBox(height: 8),
          TextFormField(
            initialValue: draft.label,
            onChanged: (value) {
              onChanged(
                draft.copyWith(
                  label: value,
                  key: draft.manualKey
                      ? draft.key
                      : slugifyHabitFieldKey(value),
                ),
              );
            },
            decoration: InputDecoration(
              labelText: context.l10n.habitsFieldLabel,
            ),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<HabitTrackerFieldType>(
            initialValue: draft.type,
            items: HabitTrackerFieldType.values
                .map(
                  (value) => DropdownMenuItem(
                    value: value,
                    child: Text(_fieldTypeLabel(context, value)),
                  ),
                )
                .toList(growable: false),
            onChanged: (value) {
              if (value != null) {
                onChanged(draft.copyWith(type: value));
              }
            },
            decoration: InputDecoration(
              labelText: context.l10n.habitsFieldType,
            ),
          ),
          const SizedBox(height: 12),
          TextFormField(
            initialValue: draft.key,
            onChanged: (value) {
              onChanged(
                draft.copyWith(
                  key: slugifyHabitFieldKey(value),
                  manualKey: true,
                ),
              );
            },
            decoration: InputDecoration(labelText: context.l10n.habitsFieldKey),
          ),
          const SizedBox(height: 12),
          TextFormField(
            initialValue: draft.unit,
            onChanged: (value) => onChanged(draft.copyWith(unit: value)),
            decoration: InputDecoration(
              labelText: context.l10n.habitsFieldUnit,
            ),
          ),
          const SizedBox(height: 12),
          TextFormField(
            initialValue: draft.optionsText,
            onChanged: draft.type == HabitTrackerFieldType.select
                ? (value) => onChanged(draft.copyWith(optionsText: value))
                : null,
            decoration: InputDecoration(
              labelText: context.l10n.habitsFieldOptions,
              hintText: context.l10n.habitsFieldOptionsHint,
            ),
          ),
          const SizedBox(height: 8),
          SwitchListTile.adaptive(
            contentPadding: EdgeInsets.zero,
            title: Text(context.l10n.habitsFieldRequired),
            value: draft.required,
            onChanged: (value) => onChanged(draft.copyWith(required: value)),
          ),
        ],
      ),
    );
  }

  String _fieldTypeLabel(BuildContext context, HabitTrackerFieldType type) {
    final l10n = context.l10n;
    return switch (type) {
      HabitTrackerFieldType.boolean => l10n.habitsFieldTypeBoolean,
      HabitTrackerFieldType.number => l10n.habitsFieldTypeNumber,
      HabitTrackerFieldType.duration => l10n.habitsFieldTypeDuration,
      HabitTrackerFieldType.text => l10n.habitsFieldTypeText,
      HabitTrackerFieldType.select => l10n.habitsFieldTypeSelect,
    };
  }
}

extension on String {
  String slice(int start, [int? end]) => substring(start, end);
}
