import 'package:flutter/material.dart';
import 'package:flutter_colorpicker/flutter_colorpicker.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/utils/color_hex.dart';
import 'package:mobile/features/tasks_estimates/utils/task_label_colors.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class TaskLabelFormValue {
  const TaskLabelFormValue({
    required this.name,
    required this.color,
  });

  final String name;
  final String color;
}

class TaskLabelDialog extends StatefulWidget {
  const TaskLabelDialog({
    required this.title,
    required this.submitLabel,
    required this.onSubmit,
    this.initialName,
    this.initialColor,
    super.key,
  });

  final String title;
  final String submitLabel;
  final Future<bool> Function(TaskLabelFormValue value) onSubmit;
  final String? initialName;
  final String? initialColor;

  @override
  State<TaskLabelDialog> createState() => _TaskLabelDialogState();
}

class _TaskLabelDialogState extends State<TaskLabelDialog> {
  late final TextEditingController _nameController;
  late final TextEditingController _colorController;
  String? _nameError;
  String? _colorError;
  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.initialName ?? '');
    _colorController = TextEditingController(
      text: taskLabelColorOrDefault(widget.initialColor),
    );
  }

  @override
  void dispose() {
    _nameController.dispose();
    _colorController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final previewColor =
        parseTaskLabelColor(_colorController.text) ?? const Color(0xFF3B82F6);
    final theme = shad.Theme.of(context);
    final previewName = _nameController.text.trim();
    final keyboardBottomInset = MediaQuery.viewInsetsOf(context).bottom;

    return PopScope(
      canPop: !_isSubmitting,
      child: Container(
        decoration: BoxDecoration(
          color: theme.colorScheme.background,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
        ),
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            padding: EdgeInsets.fromLTRB(
              24,
              24,
              24,
              24 + keyboardBottomInset,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  widget.title,
                  style: theme.typography.h3,
                ),
                const shad.Gap(24),
                Text(context.l10n.taskLabelsName),
                const shad.Gap(4),
                shad.TextField(
                  controller: _nameController,
                  hintText: context.l10n.taskLabelsName,
                  autofocus: true,
                  onChanged: (_) {
                    setState(() {
                      if (_nameError != null) {
                        _nameError = null;
                      }
                    });
                  },
                ),
                if (_nameError != null) ...[
                  const shad.Gap(8),
                  Text(
                    _nameError!,
                    style: theme.typography.small.copyWith(
                      color: theme.colorScheme.destructive,
                    ),
                  ),
                ],
                const shad.Gap(16),
                Text(context.l10n.calendarEventColor),
                const shad.Gap(4),
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
                      child: shad.TextField(
                        controller: _colorController,
                        hintText: kDefaultTaskLabelColor,
                        onChanged: (_) {
                          setState(() {
                            _colorError = null;
                          });
                        },
                      ),
                    ),
                  ],
                ),
                const shad.Gap(8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    shad.OutlineButton(
                      onPressed: _openColorPicker,
                      child: Text(context.l10n.financePickColor),
                    ),
                    shad.OutlineButton(
                      onPressed: () {
                        setState(() {
                          _colorController.text = randomHexColor();
                          _colorError = null;
                        });
                      },
                      child: Text(context.l10n.financeRandomizeColor),
                    ),
                  ],
                ),
                Container(
                  padding: const EdgeInsets.fromLTRB(0, 12, 0, 12),
                  child: Row(
                    children: [
                      Text(
                        context.l10n.financePreview,
                        style: theme.typography.small.copyWith(
                          color: theme.colorScheme.mutedForeground,
                        ),
                      ),
                      const shad.Gap(8),
                      Builder(
                        builder: (context) {
                          final labelText = previewName.isEmpty
                              ? context.l10n.taskLabelsName
                              : previewName;
                          final parsedPreviewColor = parseTaskLabelColor(
                            _colorController.text,
                          );

                          if (parsedPreviewColor == null) {
                            return shad.OutlineBadge(child: Text(labelText));
                          }

                          return Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: parsedPreviewColor.withAlpha(28),
                              borderRadius: BorderRadius.circular(999),
                              border: Border.all(
                                color: parsedPreviewColor.withAlpha(180),
                              ),
                            ),
                            child: Text(
                              labelText,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: theme.typography.small.copyWith(
                                fontSize: 11,
                                color: parsedPreviewColor.withAlpha(240),
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          );
                        },
                      ),
                    ],
                  ),
                ),
                if (_colorError != null) ...[
                  const shad.Gap(8),
                  Text(
                    _colorError!,
                    style: theme.typography.small.copyWith(
                      color: theme.colorScheme.destructive,
                    ),
                  ),
                ],
                const shad.Gap(24),
                Row(
                  children: [
                    Expanded(
                      child: shad.OutlineButton(
                        onPressed: _isSubmitting
                            ? null
                            : () => Navigator.of(context).pop(),
                        child: Text(context.l10n.commonCancel),
                      ),
                    ),
                    const shad.Gap(12),
                    Expanded(
                      child: shad.PrimaryButton(
                        onPressed: _isSubmitting ? null : _submit,
                        child: _isSubmitting
                            ? const SizedBox.square(
                                dimension: 16,
                                child: shad.CircularProgressIndicator(),
                              )
                            : Text(widget.submitLabel),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _setSubmitting(bool value) {
    if (!mounted || _isSubmitting == value) {
      return;
    }
    setState(() {
      _isSubmitting = value;
    });
  }

  Future<void> _openColorPicker() async {
    var selected =
        parseTaskLabelColor(_colorController.text) ?? const Color(0xFF3B82F6);

    final result = await showAdaptiveSheet<Color>(
      context: context,
      barrierColor: Colors.transparent,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return shad.AlertDialog(
              title: Text(context.l10n.financePickColor),
              content: SizedBox(
                width: double.maxFinite,
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
      setState(() {
        _colorController.text = colorToHexString(result);
        _colorError = null;
      });
    }
  }

  Future<void> _submit() async {
    final name = _nameController.text.trim();
    final normalizedColor = normalizeTaskLabelColor(_colorController.text);
    final hasNameError = name.isEmpty;
    final hasColorError = normalizedColor == null;

    setState(() {
      _nameError = hasNameError ? context.l10n.taskLabelsNameRequired : null;
      _colorError = hasColorError ? context.l10n.taskLabelsColorInvalid : null;
    });

    if (hasNameError || hasColorError) {
      return;
    }

    _setSubmitting(true);
    try {
      final shouldClose = await widget.onSubmit(
        TaskLabelFormValue(
          name: name,
          color: normalizedColor,
        ),
      );
      if (!mounted) {
        return;
      }

      if (shouldClose) {
        Navigator.of(context).pop(true);
      }
    } finally {
      _setSubmitting(false);
    }
  }
}
