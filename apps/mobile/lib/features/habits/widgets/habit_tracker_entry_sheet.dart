import 'package:flutter/material.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/data/models/habit_tracker.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class HabitTrackerEntrySheet extends StatefulWidget {
  const HabitTrackerEntrySheet({
    required this.detail,
    required this.onSubmit,
    super.key,
  });

  final HabitTrackerDetailResponse detail;
  final Future<void> Function(HabitTrackerEntryInput input) onSubmit;

  @override
  State<HabitTrackerEntrySheet> createState() => _HabitTrackerEntrySheetState();
}

class _HabitTrackerEntrySheetState extends State<HabitTrackerEntrySheet> {
  late final TextEditingController _dateController;
  late final TextEditingController _noteController;
  late final TextEditingController _tagsController;
  late final Map<String, TextEditingController> _valueControllers;
  late final Map<String, bool> _booleanValues;
  late final Map<String, String?> _selectedValues;
  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    _dateController = TextEditingController(
      text: DateTime.now().toIso8601String().slice(0, 10),
    );
    _noteController = TextEditingController();
    _tagsController = TextEditingController();
    _valueControllers = {
      for (final field in widget.detail.tracker.inputSchema)
        if (field.type != HabitTrackerFieldType.boolean &&
            field.type != HabitTrackerFieldType.select)
          field.key: TextEditingController(),
    };
    _booleanValues = {
      for (final field in widget.detail.tracker.inputSchema)
        if (field.type == HabitTrackerFieldType.boolean) field.key: false,
    };
    _selectedValues = {
      for (final field in widget.detail.tracker.inputSchema)
        if (field.type == HabitTrackerFieldType.select)
          field.key: field.options.isEmpty ? null : field.options.first.value,
    };
  }

  @override
  void dispose() {
    _dateController.dispose();
    _noteController.dispose();
    _tagsController.dispose();
    for (final controller in _valueControllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return _EntrySheetContainer(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  l10n.habitsLogEntryTitle,
                  style: Theme.of(
                    context,
                  ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
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
            l10n.habitsLogEntryDescription,
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: 20),
          Expanded(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _LabeledField(
                    label: l10n.habitsEntryDateLabel,
                    child: TextField(
                      controller: _dateController,
                      readOnly: true,
                      onTap: _pickDate,
                      decoration: const InputDecoration(
                        suffixIcon: Icon(Icons.calendar_today_outlined),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  for (final field in widget.detail.tracker.inputSchema) ...[
                    _buildField(context, field),
                    const SizedBox(height: 16),
                  ],
                  _LabeledField(
                    label: l10n.habitsEntryNoteLabel,
                    child: TextField(
                      controller: _noteController,
                      minLines: 3,
                      maxLines: 5,
                    ),
                  ),
                  const SizedBox(height: 16),
                  _LabeledField(
                    label: l10n.habitsEntryTagsLabel,
                    child: TextField(
                      controller: _tagsController,
                      decoration: InputDecoration(
                        hintText: l10n.habitsEntryTagsHint,
                      ),
                    ),
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
                  child: Text(l10n.commonCancel),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: shad.PrimaryButton(
                  onPressed: _isSubmitting ? null : _submit,
                  child: _isSubmitting
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text(l10n.habitsSaveEntry),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildField(BuildContext context, HabitTrackerFieldSchema field) {
    final l10n = context.l10n;
    return _LabeledField(
      label: field.label,
      child: switch (field.type) {
        HabitTrackerFieldType.boolean => SwitchListTile.adaptive(
          value: _booleanValues[field.key] ?? false,
          title: Text(
            (_booleanValues[field.key] ?? false)
                ? l10n.habitsMarkedDone
                : l10n.habitsMarkDone,
          ),
          contentPadding: EdgeInsets.zero,
          onChanged: (value) {
            setState(() {
              _booleanValues[field.key] = value;
            });
          },
        ),
        HabitTrackerFieldType.select => DropdownButtonFormField<String>(
          initialValue: _selectedValues[field.key],
          items: field.options
              .map(
                (option) => DropdownMenuItem<String>(
                  value: option.value,
                  child: Text(option.label),
                ),
              )
              .toList(growable: false),
          onChanged: (value) {
            setState(() {
              _selectedValues[field.key] = value;
            });
          },
        ),
        HabitTrackerFieldType.text => TextField(
          controller: _valueControllers[field.key],
          minLines: 3,
          maxLines: 5,
        ),
        _ => TextField(
          controller: _valueControllers[field.key],
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
        ),
      },
    );
  }

  Future<void> _pickDate() async {
    final current = DateTime.tryParse(_dateController.text) ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: current,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (picked != null) {
      _dateController.text = picked.toIso8601String().slice(0, 10);
    }
  }

  Future<void> _submit() async {
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    final values = <String, Object?>{};
    for (final field in widget.detail.tracker.inputSchema) {
      switch (field.type) {
        case HabitTrackerFieldType.boolean:
          values[field.key] = _booleanValues[field.key] ?? false;
        case HabitTrackerFieldType.select:
          values[field.key] = _selectedValues[field.key] ?? '';
        case HabitTrackerFieldType.text:
          values[field.key] = _valueControllers[field.key]?.text.trim() ?? '';
        case HabitTrackerFieldType.number:
        case HabitTrackerFieldType.duration:
          final raw = _valueControllers[field.key]?.text.trim() ?? '';
          if (field.required && raw.isEmpty) {
            _showErrorToast(toastContext, context.l10n.habitsFormRequiredField);
            return;
          }
          final parsed = raw.isEmpty ? 0 : double.tryParse(raw);
          if (parsed == null) {
            _showErrorToast(toastContext, context.l10n.habitsFormInvalidNumber);
            return;
          }
          values[field.key] = parsed;
      }
      if (field.required) {
        final value = values[field.key];
        final missing =
            value == null ||
            (value is String && value.trim().isEmpty) ||
            (field.type == HabitTrackerFieldType.boolean && value != true);
        if (missing) {
          _showErrorToast(toastContext, context.l10n.habitsFormRequiredField);
          return;
        }
      }
    }

    setState(() => _isSubmitting = true);
    try {
      await widget.onSubmit(
        HabitTrackerEntryInput(
          entryDate: _dateController.text,
          values: values,
          note: _noteController.text.trim().isEmpty
              ? null
              : _noteController.text.trim(),
          tags: _tagsController.text
              .split(',')
              .map((value) => value.trim())
              .where((value) => value.isNotEmpty)
              .toList(growable: false),
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

  void _showErrorToast(BuildContext toastContext, String message) {
    shad.showToast(
      context: toastContext,
      builder: (toastContext, overlay) =>
          shad.Alert.destructive(content: Text(message)),
    );
  }
}

class _EntrySheetContainer extends StatelessWidget {
  const _EntrySheetContainer({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final height = context.isCompact
        ? MediaQuery.sizeOf(context).height * 0.88
        : 720.0;
    return SizedBox(
      height: height,
      child: Material(
        color: Theme.of(context).colorScheme.surface,
        child: Padding(padding: const EdgeInsets.all(20), child: child),
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

extension on String {
  String slice(int start, [int? end]) => substring(start, end);
}
