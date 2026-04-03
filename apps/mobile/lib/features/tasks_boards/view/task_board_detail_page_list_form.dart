part of 'task_board_detail_page.dart';

class _TaskBoardListFormSheet extends StatefulWidget {
  const _TaskBoardListFormSheet({
    required this.title,
    required this.confirmLabel,
    required this.successMessage,
    required this.onSubmit,
    this.initialName = '',
    this.initialStatus = 'active',
    this.initialColor = 'BLUE',
    this.existingLists = const [],
  });

  final String title;
  final String confirmLabel;
  final String successMessage;
  final Future<void> Function({
    required String name,
    required String status,
    required String color,
  })
  onSubmit;
  final String initialName;
  final String initialStatus;
  final String initialColor;
  final List<TaskBoardList> existingLists;

  @override
  State<_TaskBoardListFormSheet> createState() {
    return _TaskBoardListFormSheetState();
  }
}

class _TaskBoardListFormSheetState extends State<_TaskBoardListFormSheet> {
  late final TextEditingController _nameController;
  late String _selectedStatus;
  late String _selectedColor;
  bool _isSubmitting = false;

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

    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Sheet handle indicator
            Center(
              child: Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: theme.colorScheme.mutedForeground.withValues(
                    alpha: 0.3,
                  ),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const shad.Gap(16),
            // Title
            Text(
              widget.title,
              style: theme.typography.h4,
            ),
            const shad.Gap(24),
            // List name field
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
              enabled: !_isSubmitting,
              onSubmitted: (_) => _submit(),
            ),
            const shad.Gap(16),
            // Status category dropdown
            Text(
              context.l10n.taskBoardDetailStatusCategoryLabel,
              style: theme.typography.small.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            const shad.Gap(8),
            IgnorePointer(
              ignoring: _isSubmitting,
              child: _StatusCategoryDropdown(
                selectedStatus: _selectedStatus,
                statusOptions: statusOptions,
                existingLists: widget.existingLists,
                onChanged: (status) {
                  if (status != null) {
                    setState(() => _selectedStatus = status);
                  }
                },
              ),
            ),
            const shad.Gap(16),
            // Color dropdown
            Text(
              context.l10n.taskBoardDetailColorLabel,
              style: theme.typography.small.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            const shad.Gap(8),
            IgnorePointer(
              ignoring: _isSubmitting,
              child: _ColorDropdown(
                selectedColor: _selectedColor,
                colorOptions: colorOptions,
                onChanged: (color) {
                  if (color != null) {
                    setState(() => _selectedColor = color);
                  }
                },
              ),
            ),
            const shad.Gap(24),
            // Action buttons row
            Row(
              children: [
                Expanded(
                  child: shad.OutlineButton(
                    onPressed: _isSubmitting
                        ? null
                        : () => Navigator.of(context).pop(),
                    child: Text(
                      context.l10n.commonCancel,
                      textAlign: TextAlign.center,
                    ),
                  ),
                ),
                const shad.Gap(12),
                Expanded(
                  child: shad.PrimaryButton(
                    onPressed: _isSubmitting ? null : _submit,
                    child: _isSubmitting
                        ? const SizedBox(
                            height: 16,
                            width: 16,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              valueColor: AlwaysStoppedAnimation<Color>(
                                Colors.white,
                              ),
                            ),
                          )
                        : Text(
                            widget.confirmLabel,
                            textAlign: TextAlign.center,
                          ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _submit() async {
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

    setState(() => _isSubmitting = true);

    try {
      await widget.onSubmit(
        name: name,
        status: _selectedStatus,
        color: _selectedColor,
      );
      if (!mounted) return;
      final toastContext = Navigator.of(context, rootNavigator: true).context;
      if (!toastContext.mounted) return;
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) => shad.Alert(
          content: Text(widget.successMessage),
        ),
      );
      Navigator.of(context).pop();
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _isSubmitting = false);
      final toastContext = Navigator.of(context, rootNavigator: true).context;
      if (!toastContext.mounted) return;
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) => shad.Alert.destructive(
          content: Text(
            error.message.trim().isEmpty
                ? context.l10n.commonSomethingWentWrong
                : error.message,
          ),
        ),
      );
    } on Exception {
      if (!mounted) return;
      setState(() => _isSubmitting = false);
      final toastContext = Navigator.of(context, rootNavigator: true).context;
      if (!toastContext.mounted) return;
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) => shad.Alert.destructive(
          content: Text(context.l10n.commonSomethingWentWrong),
        ),
      );
    }
  }
}

class _StatusCategoryDropdown extends StatelessWidget {
  const _StatusCategoryDropdown({
    required this.selectedStatus,
    required this.statusOptions,
    required this.onChanged,
    required this.existingLists,
  });

  final String selectedStatus;
  final List<_TaskBoardListStatusOption> statusOptions;
  final ValueChanged<String?> onChanged;
  final List<TaskBoardList> existingLists;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final selectedOption = statusOptions.firstWhere(
      (option) => option.value == selectedStatus,
      orElse: () => statusOptions.first,
    );
    final canCreateClosed = _taskBoardCanCreateListInStatus(
      existingLists,
      'closed',
    );

    return shad.OutlineButton(
      onPressed: () {
        shad.showDropdown<void>(
          context: context,
          builder: (dropdownContext) {
            return shad.DropdownMenu(
              children: statusOptions
                  .map((option) {
                    final isSelected = option.value == selectedStatus;
                    final isClosedDisabled =
                        option.value == 'closed' && !canCreateClosed;
                    return shad.MenuButton(
                      leading: Icon(
                        option.icon,
                        size: 18,
                        color: option.color,
                      ),
                      trailing: isSelected
                          ? const Icon(Icons.check, size: 16)
                          : const SizedBox(width: 16),
                      onPressed: isClosedDisabled
                          ? null
                          : (_) => onChanged(option.value),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              option.label,
                              style: theme.typography.small.copyWith(
                                fontWeight: FontWeight.w500,
                                color: isClosedDisabled
                                    ? theme.colorScheme.mutedForeground
                                    : null,
                              ),
                            ),
                          ),
                          if (isClosedDisabled)
                            Text(
                              ' (1 max)',
                              style: theme.typography.small.copyWith(
                                fontSize: 10,
                                color: theme.colorScheme.mutedForeground,
                              ),
                            ),
                        ],
                      ),
                    );
                  })
                  .toList(growable: false),
            );
          },
        );
      },
      child: Row(
        children: [
          Icon(
            selectedOption.icon,
            size: 18,
            color: selectedOption.color,
          ),
          const shad.Gap(12),
          Expanded(
            child: Text(
              selectedOption.label,
              style: theme.typography.small.copyWith(
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          const Icon(Icons.keyboard_arrow_down, size: 18),
        ],
      ),
    );
  }
}

class _ColorDropdown extends StatelessWidget {
  const _ColorDropdown({
    required this.selectedColor,
    required this.colorOptions,
    required this.onChanged,
  });

  final String selectedColor;
  final List<_TaskBoardListColorOption> colorOptions;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final selectedOption = colorOptions.firstWhere(
      (option) => option.value == selectedColor,
      orElse: () => colorOptions.first,
    );

    return shad.OutlineButton(
      onPressed: () {
        shad.showDropdown<void>(
          context: context,
          builder: (dropdownContext) {
            return shad.DropdownMenu(
              children: colorOptions
                  .map((option) {
                    final isSelected = option.value == selectedColor;
                    return shad.MenuButton(
                      leading: Container(
                        width: 20,
                        height: 20,
                        decoration: BoxDecoration(
                          color: option.color,
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: theme.colorScheme.border,
                          ),
                        ),
                      ),
                      trailing: isSelected
                          ? const Icon(Icons.check, size: 16)
                          : const SizedBox(width: 16),
                      onPressed: (_) => onChanged(option.value),
                      child: Text(
                        option.label,
                        style: theme.typography.small.copyWith(
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    );
                  })
                  .toList(growable: false),
            );
          },
        );
      },
      child: Row(
        children: [
          Container(
            width: 20,
            height: 20,
            decoration: BoxDecoration(
              color: selectedOption.color,
              shape: BoxShape.circle,
              border: Border.all(
                color: theme.colorScheme.border,
              ),
            ),
          ),
          const shad.Gap(12),
          Expanded(
            child: Text(
              selectedOption.label,
              style: theme.typography.small.copyWith(
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          const Icon(Icons.keyboard_arrow_down, size: 18),
        ],
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
  State<_TaskBoardTextInputDialog> createState() {
    return _TaskBoardTextInputDialogState();
  }
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
