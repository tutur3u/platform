import 'package:flutter/material.dart';
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
    this.initialName,
    this.initialColor,
    super.key,
  });

  final String title;
  final String submitLabel;
  final String? initialName;
  final String? initialColor;

  @override
  State<TaskLabelDialog> createState() => _TaskLabelDialogState();
}

class _TaskLabelDialogState extends State<TaskLabelDialog> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _nameController;
  late final TextEditingController _colorController;

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

    return shad.AlertDialog(
      title: Text(widget.title),
      content: Form(
        key: _formKey,
        child: SizedBox(
          width: double.maxFinite,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(context.l10n.taskLabelsName),
              const shad.Gap(4),
              TextFormField(
                controller: _nameController,
                autofocus: true,
                decoration: const InputDecoration(border: OutlineInputBorder()),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return context.l10n.taskLabelsNameRequired;
                  }
                  return null;
                },
              ),
              const shad.Gap(12),
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
                    child: TextFormField(
                      controller: _colorController,
                      decoration: const InputDecoration(
                        border: OutlineInputBorder(),
                        hintText: '#3B82F6',
                      ),
                      validator: (value) {
                        if (!isTaskLabelColorPreset(value)) {
                          return context.l10n.taskLabelsColorInvalid;
                        }
                        return null;
                      },
                      onChanged: (_) => setState(() {}),
                    ),
                  ),
                ],
              ),
              const shad.Gap(8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final color in taskLabelColorPresets)
                    GestureDetector(
                      onTap: () {
                        _colorController.text = color;
                        setState(() {});
                      },
                      child: Container(
                        width: 28,
                        height: 28,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: parseTaskLabelColor(color),
                          border: Border.all(
                            color: _colorController.text.toUpperCase() == color
                                ? Colors.white
                                : Colors.transparent,
                            width: 2,
                          ),
                        ),
                      ),
                    ),
                  shad.OutlineButton(
                    onPressed: () {
                      _colorController.text = randomTaskLabelColorPreset();
                      setState(() {});
                    },
                    child: Text(context.l10n.financeRandomizeColor),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
      actions: [
        shad.OutlineButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(context.l10n.commonCancel),
        ),
        shad.PrimaryButton(
          onPressed: _submit,
          child: Text(widget.submitLabel),
        ),
      ],
    );
  }

  void _submit() {
    if (!(_formKey.currentState?.validate() ?? false)) {
      return;
    }

    Navigator.of(context).pop(
      TaskLabelFormValue(
        name: _nameController.text.trim(),
        color: taskLabelColorOrDefault(_colorController.text),
      ),
    );
  }
}
