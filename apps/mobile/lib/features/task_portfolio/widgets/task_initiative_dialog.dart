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
  const TaskInitiativeDialog({super.key, this.initiative});

  final TaskInitiativeSummary? initiative;

  @override
  State<TaskInitiativeDialog> createState() => _TaskInitiativeDialogState();
}

class _TaskInitiativeDialogState extends State<TaskInitiativeDialog> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _nameController;
  late final TextEditingController _descriptionController;
  late String _status;

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

    return shad.AlertDialog(
      title: Text(
        isEditing
            ? context.l10n.taskPortfolioEditInitiative
            : context.l10n.taskPortfolioCreateInitiative,
      ),
      content: Form(
        key: _formKey,
        child: SizedBox(
          width: double.maxFinite,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(context.l10n.taskPortfolioInitiativeName),
              const shad.Gap(4),
              TextFormField(
                controller: _nameController,
                autofocus: true,
                decoration: const InputDecoration(border: OutlineInputBorder()),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return context.l10n.taskPortfolioInitiativeNameRequired;
                  }
                  return null;
                },
              ),
              const shad.Gap(12),
              Text(context.l10n.financeDescription),
              const shad.Gap(4),
              TextFormField(
                controller: _descriptionController,
                decoration: InputDecoration(
                  border: const OutlineInputBorder(),
                  hintText: context.l10n.taskPortfolioInitiativeDescriptionHint,
                ),
                minLines: 2,
                maxLines: 4,
              ),
              const shad.Gap(12),
              Text(context.l10n.taskPortfolioInitiativeStatus),
              const shad.Gap(4),
              DropdownButtonFormField<String>(
                initialValue: _status,
                decoration: const InputDecoration(
                  border: OutlineInputBorder(),
                ),
                items: _initiativeStatuses
                    .map(
                      (value) => DropdownMenuItem<String>(
                        value: value,
                        child: Text(_initiativeStatusLabel(context, value)),
                      ),
                    )
                    .toList(growable: false),
                onChanged: (value) {
                  if (value != null) {
                    setState(() => _status = value);
                  }
                },
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
          child: Text(
            isEditing
                ? context.l10n.timerSave
                : context.l10n.taskPortfolioCreateInitiative,
          ),
        ),
      ],
    );
  }

  void _submit() {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    Navigator.of(context).pop(
      TaskInitiativeFormValue(
        name: _nameController.text.trim(),
        description: _normalizeDescription(_descriptionController.text),
        status: _status,
      ),
    );
  }
}
