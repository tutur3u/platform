part of 'task_portfolio_dialogs.dart';

class TaskInitiativeSheet extends StatefulWidget {
  const TaskInitiativeSheet({
    super.key,
    this.initiative,
    this.onSubmit,
  });

  final TaskInitiativeSummary? initiative;
  final Future<bool> Function(TaskInitiativeFormValue value)? onSubmit;

  @override
  State<TaskInitiativeSheet> createState() => _TaskInitiativeSheetState();
}

class _TaskInitiativeSheetState extends State<TaskInitiativeSheet> {
  late final TextEditingController _nameController;
  late final TextEditingController _descriptionController;
  late String _status;
  String? _nameError;
  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(
      text: widget.initiative?.name ?? '',
    );
    _descriptionController = TextEditingController(
      text: widget.initiative?.description ?? '',
    );
    _status = widget.initiative?.status ?? 'active';
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isEditing = widget.initiative != null;
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
                isEditing
                    ? context.l10n.taskPortfolioEditInitiative
                    : context.l10n.taskPortfolioCreateInitiative,
                style: theme.typography.h4,
              ),
              const shad.Gap(24),
              // Scrollable content
              Flexible(
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // Initiative name field
                      Text(
                        context.l10n.taskPortfolioInitiativeName,
                        style: theme.typography.small.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const shad.Gap(8),
                      shad.TextField(
                        controller: _nameController,
                        hintText: context.l10n.taskPortfolioInitiativeName,
                        autofocus: true,
                        enabled: !_isSubmitting,
                        onSubmitted: (_) => _submit(),
                      ),
                      if (_nameError != null) ...[
                        const shad.Gap(4),
                        Text(
                          _nameError!,
                          style: theme.typography.small.copyWith(
                            color: theme.colorScheme.destructive,
                          ),
                        ),
                      ],
                      const shad.Gap(16),
                      // Description field
                      Text(
                        context.l10n.financeDescription,
                        style: theme.typography.small.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const shad.Gap(8),
                      shad.TextArea(
                        controller: _descriptionController,
                        hintText:
                            context.l10n.taskPortfolioInitiativeDescriptionHint,
                        initialHeight: 88,
                        minHeight: 88,
                        maxHeight: 140,
                        enabled: !_isSubmitting,
                      ),
                      const shad.Gap(16),
                      // Status dropdown
                      Text(
                        context.l10n.taskPortfolioInitiativeStatus,
                        style: theme.typography.small.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const shad.Gap(8),
                      IgnorePointer(
                        ignoring: _isSubmitting,
                        child: shad.OutlineButton(
                          onPressed: _pickStatus,
                          child: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  _initiativeStatusLabel(context, _status),
                                  textAlign: TextAlign.left,
                                ),
                              ),
                              const Icon(
                                shad.LucideIcons.chevronDown,
                                size: 16,
                              ),
                            ],
                          ),
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
                              isEditing
                                  ? context.l10n.timerSave
                                  : context.l10n.taskPortfolioCreateInitiative,
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

  Future<void> _pickStatus() async {
    final selected = await showAdaptiveSheet<String>(
      context: context,
      maxDialogWidth: 420,
      builder: (dialogCtx) {
        return shad.AlertDialog(
          title: Text(context.l10n.taskPortfolioInitiativeStatus),
          content: SizedBox(
            width: double.maxFinite,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 260),
              child: ListView(
                shrinkWrap: true,
                children: _initiativeStatuses
                    .map(
                      (value) => shad.GhostButton(
                        onPressed: () => Navigator.of(dialogCtx).pop(value),
                        child: Align(
                          alignment: Alignment.centerLeft,
                          child: Text(_initiativeStatusLabel(context, value)),
                        ),
                      ),
                    )
                    .toList(growable: false),
              ),
            ),
          ),
        );
      },
    );

    if (!mounted || selected == null) {
      return;
    }

    setState(() => _status = selected);
  }

  Future<void> _submit() async {
    if (_isSubmitting) return;

    final trimmedName = _nameController.text.trim();
    if (trimmedName.isEmpty) {
      setState(() {
        _nameError = context.l10n.taskPortfolioInitiativeNameRequired;
      });
      return;
    }

    if (_nameError != null) {
      setState(() {
        _nameError = null;
      });
    }

    final value = TaskInitiativeFormValue(
      name: trimmedName,
      description: _normalizeDescription(_descriptionController.text),
      status: _status,
    );

    final submit = widget.onSubmit;
    if (submit == null) {
      Navigator.of(context).pop(value);
      return;
    }

    setState(() => _isSubmitting = true);
    final success = await submit(value);
    if (!mounted) return;

    if (!success) {
      setState(() => _isSubmitting = false);
      return;
    }

    Navigator.of(context).pop();
  }
}
