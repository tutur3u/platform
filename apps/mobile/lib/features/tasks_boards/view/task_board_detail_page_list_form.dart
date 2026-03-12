part of 'task_board_detail_page.dart';

class _TaskBoardListFormValue {
  const _TaskBoardListFormValue({
    required this.name,
    required this.status,
    required this.color,
  });

  final String name;
  final String status;
  final String color;
}

class _TaskBoardListFormDialog extends StatefulWidget {
  const _TaskBoardListFormDialog({
    required this.title,
    required this.confirmLabel,
    this.initialName = '',
    this.initialStatus = 'active',
    this.initialColor = 'BLUE',
  });

  final String title;
  final String confirmLabel;
  final String initialName;
  final String initialStatus;
  final String initialColor;

  @override
  State<_TaskBoardListFormDialog> createState() =>
      _TaskBoardListFormDialogState();
}

class _TaskBoardListFormDialogState extends State<_TaskBoardListFormDialog> {
  late final TextEditingController _nameController;
  late String _selectedStatus;
  late String _selectedColor;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.initialName);
    _selectedStatus =
        TaskBoardList.normalizeSupportedStatus(widget.initialStatus) ??
        'active';
    _selectedColor =
        TaskBoardList.normalizeSupportedColor(widget.initialColor) ?? 'BLUE';
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final statusOptions = _taskBoardListStatusOptions(context);
    final colorOptions = _taskBoardListColorOptions(context);

    return shad.AlertDialog(
      title: Text(widget.title),
      content: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 420),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                context.l10n.taskBoardDetailListNameLabel,
                style: theme.typography.small.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
              const shad.Gap(8),
              shad.TextField(
                controller: _nameController,
                hintText: context.l10n.taskBoardDetailUntitledList,
                autofocus: true,
                onSubmitted: (_) => _submit(),
              ),
              const shad.Gap(16),
              Text(
                context.l10n.taskBoardDetailStatusCategoryLabel,
                style: theme.typography.small.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
              const shad.Gap(8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: statusOptions
                    .map((option) {
                      final selected = option.value == _selectedStatus;
                      return InkWell(
                        borderRadius: BorderRadius.circular(999),
                        onTap: () =>
                            setState(() => _selectedStatus = option.value),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 8,
                          ),
                          decoration: BoxDecoration(
                            color: selected
                                ? option.color.withValues(alpha: 0.14)
                                : theme.colorScheme.muted,
                            borderRadius: BorderRadius.circular(999),
                            border: Border.all(
                              color: selected
                                  ? option.color.withValues(alpha: 0.55)
                                  : theme.colorScheme.border,
                            ),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(option.icon, size: 14, color: option.color),
                              const shad.Gap(6),
                              Text(
                                option.label,
                                style: theme.typography.small.copyWith(
                                  color: selected
                                      ? option.color
                                      : theme.colorScheme.foreground,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    })
                    .toList(growable: false),
              ),
              const shad.Gap(16),
              Text(
                context.l10n.taskBoardDetailColorLabel,
                style: theme.typography.small.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
              const shad.Gap(8),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: colorOptions
                    .map((option) {
                      final selected = option.value == _selectedColor;
                      return InkWell(
                        borderRadius: BorderRadius.circular(12),
                        onTap: () =>
                            setState(() => _selectedColor = option.value),
                        child: Container(
                          width: 66,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 10,
                          ),
                          decoration: BoxDecoration(
                            color: option.surface,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: selected
                                  ? option.color
                                  : option.color.withValues(alpha: 0.2),
                              width: selected ? 2 : 1,
                            ),
                          ),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                width: 22,
                                height: 22,
                                decoration: BoxDecoration(
                                  color: option.color,
                                  shape: BoxShape.circle,
                                ),
                              ),
                              const shad.Gap(6),
                              Text(
                                option.label,
                                textAlign: TextAlign.center,
                                style: theme.typography.small.copyWith(
                                  fontSize: 11,
                                  fontWeight: selected
                                      ? FontWeight.w700
                                      : FontWeight.w500,
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    })
                    .toList(growable: false),
              ),
              const shad.Gap(20),
              shad.OutlineButton(
                onPressed: () => Navigator.of(context).pop(),
                child: Text(context.l10n.commonCancel),
              ),
              const shad.Gap(8),
              shad.PrimaryButton(
                onPressed: _submit,
                child: Text(widget.confirmLabel),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _submit() {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      final toastContext = Navigator.of(context, rootNavigator: true).context;
      if (!toastContext.mounted) return;
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) => shad.Alert.destructive(
          content: Text(context.l10n.taskBoardDetailNameRequired),
        ),
      );
      return;
    }

    Navigator.of(context).pop(
      _TaskBoardListFormValue(
        name: name,
        status: _selectedStatus,
        color: _selectedColor,
      ),
    );
  }
}

class _TaskBoardTextInputDialog extends StatefulWidget {
  const _TaskBoardTextInputDialog({
    required this.title,
    required this.hintText,
    required this.confirmLabel,
    this.initialValue = '',
  });

  final String title;
  final String hintText;
  final String confirmLabel;
  final String initialValue;

  @override
  State<_TaskBoardTextInputDialog> createState() =>
      _TaskBoardTextInputDialogState();
}

class _TaskBoardTextInputDialogState extends State<_TaskBoardTextInputDialog> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initialValue);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return shad.AlertDialog(
      title: Text(widget.title),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          shad.TextField(
            controller: _controller,
            hintText: widget.hintText,
            autofocus: true,
            onSubmitted: (_) => _submit(),
          ),
          const shad.Gap(12),
          shad.OutlineButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(context.l10n.commonCancel),
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
    final value = _controller.text.trim();
    if (value.isEmpty) {
      final toastContext = Navigator.of(context, rootNavigator: true).context;
      if (!toastContext.mounted) return;
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) => shad.Alert.destructive(
          content: Text(context.l10n.taskBoardDetailNameRequired),
        ),
      );
      return;
    }

    Navigator.of(context).pop(value);
  }
}
