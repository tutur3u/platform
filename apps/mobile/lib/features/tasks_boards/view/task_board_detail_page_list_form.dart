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
    this.currentListId,
    this.existingLists = const [],
  });

  final String title;
  final String confirmLabel;
  final String successMessage;
  final Future<bool> Function({
    required String name,
    required String status,
    required String color,
  })
  onSubmit;
  final String initialName;
  final String initialStatus;
  final String initialColor;
  final String? currentListId;
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
    final viewInsets = MediaQuery.of(context).viewInsets;

    return PopScope(
      canPop: !_isSubmitting,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: EdgeInsets.fromLTRB(16, 12, 16, 20 + viewInsets.bottom),
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
              Flexible(
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // List name field
                      Text(
                        context.l10n.taskBoardDetailListNameLabel,
                        style: theme.typography.small.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const shad.Gap(8),
                      shad.TextField(
                        contextMenuBuilder: platformTextContextMenuBuilder(),
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
                          excludingListId: widget.currentListId,
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
                    ],
                  ),
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
      final didSubmit = await widget.onSubmit(
        name: name,
        status: _selectedStatus,
        color: _selectedColor,
      );
      if (!mounted) return;
      if (!didSubmit) {
        setState(() => _isSubmitting = false);
        return;
      }
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
    this.excludingListId,
  });

  final String selectedStatus;
  final List<_TaskBoardListStatusOption> statusOptions;
  final ValueChanged<String?> onChanged;
  final List<TaskBoardList> existingLists;
  final String? excludingListId;

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
      excludingListId: excludingListId,
    );

    return shad.OutlineButton(
      onPressed: () async {
        final selected = await showAdaptiveSheet<String>(
          context: context,
          backgroundColor: theme.colorScheme.background,
          builder: (_) => _StatusCategoryPickerSheet(
            selectedStatus: selectedStatus,
            statusOptions: statusOptions,
            canCreateClosed: canCreateClosed,
          ),
        );
        if (selected != null) {
          onChanged(selected);
        }
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
      onPressed: () async {
        final selected = await showAdaptiveSheet<String>(
          context: context,
          backgroundColor: theme.colorScheme.background,
          builder: (_) => _ColorPickerSheet(
            selectedColor: selectedColor,
            colorOptions: colorOptions,
          ),
        );
        if (selected != null) {
          onChanged(selected);
        }
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

class _StatusCategoryPickerSheet extends StatelessWidget {
  const _StatusCategoryPickerSheet({
    required this.selectedStatus,
    required this.statusOptions,
    required this.canCreateClosed,
  });

  final String selectedStatus;
  final List<_TaskBoardListStatusOption> statusOptions;
  final bool canCreateClosed;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return SafeArea(
      top: false,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxHeight: 420),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _TaskBoardPickerHandle(
                color: theme.colorScheme.mutedForeground,
              ),
              const shad.Gap(16),
              Text(
                context.l10n.taskBoardDetailStatusCategoryLabel,
                style: theme.typography.h4,
              ),
              const shad.Gap(16),
              ...statusOptions.map((option) {
                final isSelected = option.value == selectedStatus;
                final isClosedDisabled =
                    option.value == 'closed' && !canCreateClosed;

                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                      side: BorderSide(
                        color: isSelected
                            ? theme.colorScheme.primary
                            : theme.colorScheme.border,
                      ),
                    ),
                    leading: Icon(
                      option.icon,
                      size: 18,
                      color: isClosedDisabled
                          ? theme.colorScheme.mutedForeground
                          : option.color,
                    ),
                    title: Text(
                      option.label,
                      style: theme.typography.small.copyWith(
                        fontWeight: FontWeight.w600,
                        color: isClosedDisabled
                            ? theme.colorScheme.mutedForeground
                            : null,
                      ),
                    ),
                    subtitle: isClosedDisabled
                        ? Text(
                            context.l10n.taskBoardDetailClosedListCapacityHint,
                            style: theme.typography.small.copyWith(
                              color: theme.colorScheme.mutedForeground,
                            ),
                          )
                        : null,
                    trailing: isSelected
                        ? Icon(
                            Icons.check_rounded,
                            size: 18,
                            color: theme.colorScheme.primary,
                          )
                        : null,
                    enabled: !isClosedDisabled,
                    onTap: isClosedDisabled
                        ? null
                        : () => Navigator.of(context).pop(option.value),
                  ),
                );
              }),
            ],
          ),
        ),
      ),
    );
  }
}

class _ColorPickerSheet extends StatelessWidget {
  const _ColorPickerSheet({
    required this.selectedColor,
    required this.colorOptions,
  });

  final String selectedColor;
  final List<_TaskBoardListColorOption> colorOptions;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return SafeArea(
      top: false,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxHeight: 520),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _TaskBoardPickerHandle(
                color: theme.colorScheme.mutedForeground,
              ),
              const shad.Gap(16),
              Text(
                context.l10n.taskBoardDetailColorLabel,
                style: theme.typography.h4,
              ),
              const shad.Gap(16),
              ...colorOptions.map((option) {
                final isSelected = option.value == selectedColor;

                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                      side: BorderSide(
                        color: isSelected
                            ? option.color
                            : theme.colorScheme.border,
                      ),
                    ),
                    leading: Container(
                      width: 20,
                      height: 20,
                      decoration: BoxDecoration(
                        color: option.color,
                        shape: BoxShape.circle,
                        border: Border.all(color: theme.colorScheme.border),
                      ),
                    ),
                    title: Text(
                      option.label,
                      style: theme.typography.small.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    trailing: isSelected
                        ? Icon(
                            Icons.check_rounded,
                            size: 18,
                            color: option.color,
                          )
                        : null,
                    onTap: () => Navigator.of(context).pop(option.value),
                  ),
                );
              }),
            ],
          ),
        ),
      ),
    );
  }
}

class _TaskBoardPickerHandle extends StatelessWidget {
  const _TaskBoardPickerHandle({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        width: 36,
        height: 4,
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.3),
          borderRadius: BorderRadius.circular(2),
        ),
      ),
    );
  }
}

class _TaskBoardRenameBoardSheet extends StatefulWidget {
  const _TaskBoardRenameBoardSheet({
    required this.title,
    required this.hintText,
    required this.confirmLabel,
    required this.successMessage,
    required this.onSubmit,
    this.initialValue = '',
  });

  final String title;
  final String hintText;
  final String confirmLabel;
  final String successMessage;
  final Future<bool> Function({required String name}) onSubmit;
  final String initialValue;

  @override
  State<_TaskBoardRenameBoardSheet> createState() {
    return _TaskBoardRenameBoardSheetState();
  }
}

class _TaskBoardRenameBoardSheetState
    extends State<_TaskBoardRenameBoardSheet> {
  late final TextEditingController _controller;
  bool _isSubmitting = false;

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
    final theme = shad.Theme.of(context);
    final viewInsets = MediaQuery.of(context).viewInsets;

    return PopScope(
      canPop: !_isSubmitting,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: EdgeInsets.fromLTRB(16, 12, 16, 20 + viewInsets.bottom),
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
              // Board name field
              shad.TextField(
                contextMenuBuilder: platformTextContextMenuBuilder(),
                controller: _controller,
                hintText: widget.hintText,
                autofocus: true,
                enabled: !_isSubmitting,
                onSubmitted: (_) => _submit(),
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
      ),
    );
  }

  Future<void> _submit() async {
    final name = _controller.text.trim();
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
      final didSubmit = await widget.onSubmit(name: name);
      if (!mounted) return;
      if (!didSubmit) {
        setState(() => _isSubmitting = false);
        return;
      }
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
