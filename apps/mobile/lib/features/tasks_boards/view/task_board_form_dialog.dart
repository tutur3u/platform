import 'package:flutter/material.dart' hide Scaffold;
import 'package:mobile/core/icons/platform_icon.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/platform_icon_picker.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class TaskBoardFormValue {
  const TaskBoardFormValue({
    required this.name,
    this.icon,
  });

  final String name;
  final String? icon;
}

class TaskBoardFormDialog extends StatefulWidget {
  const TaskBoardFormDialog({
    required this.title,
    required this.confirmLabel,
    super.key,
    this.initialName,
    this.initialIcon,
  });

  final String? initialName;
  final String? initialIcon;
  final String title;
  final String confirmLabel;

  @override
  State<TaskBoardFormDialog> createState() => _TaskBoardFormDialogState();
}

class _TaskBoardFormDialogState extends State<TaskBoardFormDialog> {
  late final TextEditingController _nameController;
  String? _selectedIcon;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.initialName ?? '');
    _selectedIcon = widget.initialIcon;
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return shad.AlertDialog(
      title: Text(widget.title),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(l10n.taskBoardsNameLabel),
          const shad.Gap(8),
          shad.TextField(
            controller: _nameController,
            hintText: l10n.taskBoardsNamePlaceholder,
            autofocus: true,
            onSubmitted: (_) => _submit(),
          ),
          const shad.Gap(12),
          Text(l10n.taskBoardsIconLabel),
          const shad.Gap(8),
          PlatformIconPickerField(
            value: _selectedIcon,
            onChanged: (value) => setState(() => _selectedIcon = value),
            label: l10n.taskBoardsIconPlaceholder,
            title: l10n.taskBoardsIconPickerTitle,
            searchPlaceholder: l10n.taskBoardsIconPickerSearch,
            emptyText: l10n.taskBoardsIconPickerEmpty,
          ),
          const shad.Gap(20),
          shad.OutlineButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(l10n.commonCancel),
          ),
          const shad.Gap(8),
          shad.PrimaryButton(
            onPressed: _submit,
            child: Text(widget.confirmLabel),
          ),
        ],
      ),
    );
  }

  void _submit() {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      if (!mounted) return;
      final toastContext = Navigator.of(context, rootNavigator: true).context;
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) => shad.Alert.destructive(
          content: Text(context.l10n.taskBoardsNameRequired),
        ),
      );
      return;
    }

    final safeIcon = platformIconOptions.any((o) => o.key == _selectedIcon)
        ? _selectedIcon
        : null;
    Navigator.of(
      context,
    ).pop(TaskBoardFormValue(name: name, icon: safeIcon));
  }
}
