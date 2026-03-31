part of 'task_portfolio_dialogs.dart';

class TaskInitiativeFormValue {
  const TaskInitiativeFormValue({
    required this.name,
    required this.description,
    required this.status,
  });

  final String name;
  final String? description;
  final String status;
}

class TaskInitiativeDialog extends StatefulWidget {
  const TaskInitiativeDialog({
    super.key,
    this.initiative,
    this.onSubmit,
  });

  final TaskInitiativeSummary? initiative;
  final Future<bool> Function(TaskInitiativeFormValue value)? onSubmit;

  @override
  State<TaskInitiativeDialog> createState() => _TaskInitiativeDialogState();
}

class _TaskInitiativeDialogState extends State<TaskInitiativeDialog> {
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

    return shad.AlertDialog(
      title: Text(
        isEditing
            ? context.l10n.taskPortfolioEditInitiative
            : context.l10n.taskPortfolioCreateInitiative,
      ),
      content: SizedBox(
        width: double.maxFinite,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _FieldLabel(context.l10n.taskPortfolioInitiativeName),
              const shad.Gap(4),
              shad.TextField(
                controller: _nameController,
                autofocus: true,
                hintText: context.l10n.taskPortfolioInitiativeName,
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
              const shad.Gap(12),
              _FieldLabel(context.l10n.financeDescription),
              const shad.Gap(4),
              shad.TextArea(
                controller: _descriptionController,
                hintText: context.l10n.taskPortfolioInitiativeDescriptionHint,
                initialHeight: 88,
                minHeight: 88,
                maxHeight: 140,
              ),
              const shad.Gap(12),
              _FieldLabel(context.l10n.taskPortfolioInitiativeStatus),
              const shad.Gap(4),
              shad.OutlineButton(
                onPressed: _isSubmitting ? null : _pickStatus,
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        _initiativeStatusLabel(context, _status),
                        textAlign: TextAlign.left,
                      ),
                    ),
                    const Icon(shad.LucideIcons.chevronDown, size: 16),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
      actions: [
        shad.OutlineButton(
          onPressed: _isSubmitting ? null : () => Navigator.of(context).pop(),
          child: Text(context.l10n.commonCancel),
        ),
        shad.PrimaryButton(
          onPressed: _isSubmitting ? null : _submit,
          child: _isSubmitting
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: shad.CircularProgressIndicator(),
                )
              : Text(
                  isEditing
                      ? context.l10n.timerSave
                      : context.l10n.taskPortfolioCreateInitiative,
                ),
        ),
      ],
    );
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

    setState(() {
      _isSubmitting = true;
    });

    final success = await submit(value);
    if (!mounted) return;

    if (!success) {
      setState(() {
        _isSubmitting = false;
      });
      return;
    }

    Navigator.of(context).pop();
  }

  Future<void> _pickStatus() async {
    final selected = await showAdaptiveSheet<String>(
      context: context,
      maxDialogWidth: 420,
      builder: (dialogCtx) {
        return BackButtonListener(
          onBackButtonPressed: () async {
            if (dialogCtx.mounted) {
              await Navigator.maybePop(dialogCtx);
            }
            return true;
          },
          child: shad.AlertDialog(
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
          ),
        );
      },
    );

    if (!mounted || selected == null) {
      return;
    }

    setState(() => _status = selected);
  }
}
