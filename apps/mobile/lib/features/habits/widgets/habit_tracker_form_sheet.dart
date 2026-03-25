import 'package:flutter/material.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/data/models/habit_tracker.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/habits/habit_tracker_presentation.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class HabitTrackerFormSheet extends StatefulWidget {
  const HabitTrackerFormSheet({
    required this.onSubmit,
    super.key,
    this.tracker,
  });

  final HabitTracker? tracker;
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
  late List<HabitTrackerFieldDraft> _fields;
  String _selectedTemplateId = 'custom';
  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    final tracker = widget.tracker;
    final initialInput = tracker == null
        ? (habitTrackerTemplateById('water')?.toInput(
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
    _fields = initialInput.inputSchema
        .map(HabitTrackerFieldDraft.fromSchema)
        .toList(growable: true);
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

    return SizedBox(
      height: context.isCompact
          ? MediaQuery.sizeOf(context).height * 0.92
          : 780,
      child: Material(
        color: Theme.of(context).colorScheme.surface,
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      widget.tracker == null
                          ? l10n.habitsCreateTrackerTitle
                          : l10n.habitsEditTrackerTitle,
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: _isSubmitting
                        ? null
                        : () => Navigator.of(context).maybePop(),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                widget.tracker == null
                    ? l10n.habitsCreateTrackerDescription
                    : l10n.habitsEditTrackerDescription,
              ),
              const SizedBox(height: 20),
              Expanded(
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (widget.tracker == null) ...[
                        Text(
                          l10n.habitsTemplateLabel,
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const SizedBox(height: 12),
                        _TemplateChooser(
                          selectedTemplateId: _selectedTemplateId,
                          onSelected: _applyTemplate,
                        ),
                        const SizedBox(height: 20),
                      ],
                      _LabeledField(
                        label: l10n.habitsNameLabel,
                        child: TextField(controller: _nameController),
                      ),
                      const SizedBox(height: 16),
                      _LabeledField(
                        label: l10n.habitsDescriptionLabel,
                        child: TextField(
                          controller: _descriptionController,
                          minLines: 3,
                          maxLines: 5,
                        ),
                      ),
                      const SizedBox(height: 16),
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
                                        value ==
                                                HabitTrackerTrackingMode
                                                    .dailySummary
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
                            child:
                                _DropdownField<HabitTrackerAggregationStrategy>(
                                  label: l10n.habitsAggregationLabel,
                                  value: _aggregationStrategy,
                                  items: HabitTrackerAggregationStrategy.values
                                      .map(
                                        (value) => DropdownMenuItem(
                                          value: value,
                                          child: Text(
                                            _aggregationLabel(context, value),
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
                      const SizedBox(height: 16),
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
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          Expanded(
                            child: _LabeledField(
                              label: l10n.habitsTargetValueLabel,
                              child: TextField(
                                controller: _targetValueController,
                                keyboardType:
                                    const TextInputType.numberWithOptions(
                                      decimal: true,
                                    ),
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
                      const SizedBox(height: 20),
                      Text(
                        l10n.habitsAppearanceLabel,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 12),
                      _ColorChooser(
                        selectedColor: _selectedColor,
                        onSelected: (value) =>
                            setState(() => _selectedColor = value),
                      ),
                      const SizedBox(height: 12),
                      _DropdownField<String>(
                        label: l10n.habitsIconLabel,
                        value: _selectedIcon,
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
                      const SizedBox(height: 20),
                      Text(
                        l10n.habitsFieldsTitle,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 12),
                      for (var index = 0; index < _fields.length; index++) ...[
                        _FieldDraftCard(
                          draft: _fields[index],
                          index: index,
                          onChanged: (next) {
                            setState(() {
                              _fields[index] = next;
                              if (!next.manualKey) {
                                _fields[index] = _fields[index].copyWith(
                                  key: slugifyHabitFieldKey(next.label),
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
                        const SizedBox(height: 12),
                      ],
                      shad.OutlineButton(
                        onPressed: _fields.length >= 4 ? null : _addField,
                        child: Text(l10n.habitsAddField),
                      ),
                      const SizedBox(height: 16),
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
                      const SizedBox(height: 20),
                      Row(
                        children: [
                          Expanded(
                            child: _LabeledField(
                              label: l10n.habitsQuickAddValuesLabel,
                              child: TextField(
                                controller: _quickAddController,
                                decoration: InputDecoration(
                                  hintText: l10n.habitsQuickAddValuesHint,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: _LabeledField(
                              label: l10n.habitsFreezeAllowanceLabel,
                              child: TextField(
                                controller: _freezeAllowanceController,
                                keyboardType: TextInputType.number,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          Expanded(
                            child: _LabeledField(
                              label: l10n.habitsRecoveryWindowLabel,
                              child: TextField(
                                controller: _recoveryWindowController,
                                keyboardType: TextInputType.number,
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: SwitchListTile.adaptive(
                              contentPadding: EdgeInsets.zero,
                              title: Text(l10n.habitsActiveLabel),
                              value: _isActive,
                              onChanged: (value) {
                                setState(() => _isActive = value);
                              },
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: shad.OutlineButton(
                      onPressed: _isSubmitting
                          ? null
                          : () => Navigator.of(context).maybePop(),
                      child: SizedBox(
                        width: double.infinity,
                        child: Text(
                          context.l10n.commonCancel,
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: shad.PrimaryButton(
                      onPressed: _isSubmitting ? null : _submit,
                      child: _isSubmitting
                          ? const Center(
                              child: SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              ),
                            )
                          : SizedBox(
                              width: double.infinity,
                              child: Text(
                                widget.tracker == null
                                    ? l10n.habitsCreateTrackerAction
                                    : l10n.habitsSaveTrackerAction,
                                textAlign: TextAlign.center,
                              ),
                            ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
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
    return SizedBox(
      height: 180,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemBuilder: (context, index) {
          final template = habitTrackerTemplates[index];
          final selected = template.id == selectedTemplateId;
          final accent = habitTrackerColor(context, template.color);
          return Material(
            color: selected
                ? habitTrackerTint(context, template.color)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(20),
            child: InkWell(
              onTap: () => onSelected(template.id),
              borderRadius: BorderRadius.circular(20),
              child: Container(
                width: 220,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: selected
                        ? accent.withValues(alpha: 0.35)
                        : Colors.black12,
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(14),
                        color: habitTrackerTint(context, template.color),
                      ),
                      child: Icon(
                        habitTrackerIcon(template.icon),
                        color: accent,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      template.name,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      template.description,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
            ),
          );
        },
        separatorBuilder: (context, index) => const SizedBox(width: 12),
        itemCount: habitTrackerTemplates.length,
      ),
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
