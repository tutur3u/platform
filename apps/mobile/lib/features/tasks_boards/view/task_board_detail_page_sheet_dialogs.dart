part of 'task_board_detail_page.dart';

class _MultiSelectOption {
  const _MultiSelectOption({required this.id, required this.label});

  final String id;
  final String label;
}

class _TaskMultiSelectDialog extends StatefulWidget {
  const _TaskMultiSelectDialog({
    required this.title,
    required this.options,
    required this.selectedIds,
  });

  final String title;
  final List<_MultiSelectOption> options;
  final Set<String> selectedIds;

  @override
  State<_TaskMultiSelectDialog> createState() => _TaskMultiSelectDialogState();
}

class _TaskMultiSelectDialogState extends State<_TaskMultiSelectDialog> {
  late Set<String> _selectedIds;

  @override
  void initState() {
    super.initState();
    _selectedIds = Set<String>.from(widget.selectedIds);
  }

  @override
  Widget build(BuildContext context) {
    return shad.AlertDialog(
      title: Text(widget.title),
      content: ConstrainedBox(
        constraints: const BoxConstraints(maxHeight: 420),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: widget.options
                      .map((option) {
                        final selected = _selectedIds.contains(option.id);
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: shad.OutlineButton(
                            onPressed: () {
                              setState(() {
                                if (selected) {
                                  _selectedIds.remove(option.id);
                                } else {
                                  _selectedIds.add(option.id);
                                }
                              });
                            },
                            child: Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    option.label.trim().isEmpty
                                        ? option.id
                                        : option.label,
                                  ),
                                ),
                                if (selected) const Icon(Icons.check, size: 16),
                              ],
                            ),
                          ),
                        );
                      })
                      .toList(growable: false),
                ),
              ),
            ),
            const shad.Gap(8),
            shad.OutlineButton(
              onPressed: () => Navigator.of(context).pop(),
              child: Text(context.l10n.commonCancel),
            ),
            const shad.Gap(8),
            shad.PrimaryButton(
              onPressed: () => Navigator.of(context).pop(_selectedIds),
              child: Text(context.l10n.taskBoardDetailStatusDone),
            ),
          ],
        ),
      ),
    );
  }
}

class _TaskEstimationPickerDialog extends StatelessWidget {
  const _TaskEstimationPickerDialog({
    required this.selectedValue,
    required this.options,
    required this.mapValueLabel,
  });

  final String? selectedValue;
  final List<int> options;
  final String Function(int value) mapValueLabel;

  @override
  Widget build(BuildContext context) {
    final values = <String>['none', ...options.map((value) => '$value')];

    return shad.AlertDialog(
      title: Text(context.l10n.taskBoardDetailTaskEstimation),
      content: ConstrainedBox(
        constraints: const BoxConstraints(maxHeight: 360),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ...values.map((value) {
                final isSelected = value == (selectedValue ?? 'none');
                final label = value == 'none'
                    ? context.l10n.taskBoardDetailTaskEstimationNone
                    : mapValueLabel(int.parse(value));

                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: shad.OutlineButton(
                    onPressed: () => Navigator.of(context).pop(value),
                    child: Row(
                      children: [
                        Expanded(child: Text(label)),
                        if (isSelected) const Icon(Icons.check, size: 16),
                      ],
                    ),
                  ),
                );
              }),
              shad.OutlineButton(
                onPressed: () => Navigator.of(context).pop(),
                child: Text(context.l10n.commonCancel),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MoveTaskListDialog extends StatelessWidget {
  const _MoveTaskListDialog({required this.lists});

  final List<TaskBoardList> lists;

  @override
  Widget build(BuildContext context) {
    return shad.AlertDialog(
      title: Text(context.l10n.taskBoardDetailMoveTask),
      content: ConstrainedBox(
        constraints: const BoxConstraints(maxHeight: 360),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ...lists.map((list) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: shad.OutlineButton(
                    onPressed: () => Navigator.of(context).pop(list.id),
                    child: _TaskBoardListOptionRow(list: list),
                  ),
                );
              }),
              shad.OutlineButton(
                onPressed: () => Navigator.of(context).pop(),
                child: Text(context.l10n.commonCancel),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TaskListPickerDialog extends StatelessWidget {
  const _TaskListPickerDialog({
    required this.title,
    required this.lists,
  });

  final String title;
  final List<TaskBoardList> lists;

  @override
  Widget build(BuildContext context) {
    return shad.AlertDialog(
      title: Text(title),
      content: ConstrainedBox(
        constraints: const BoxConstraints(maxHeight: 360),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ...lists.map((list) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: shad.GhostButton(
                    onPressed: () => Navigator.of(context).pop(list.id),
                    child: _TaskBoardListOptionRow(list: list),
                  ),
                );
              }),
              shad.OutlineButton(
                onPressed: () => Navigator.of(context).pop(),
                child: Text(context.l10n.commonCancel),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TaskBoardListOptionRow extends StatelessWidget {
  const _TaskBoardListOptionRow({required this.list});

  final TaskBoardList list;

  @override
  Widget build(BuildContext context) {
    final label = list.name?.trim().isNotEmpty == true
        ? list.name!.trim()
        : context.l10n.taskBoardDetailUntitledList;
    final style = _taskBoardListVisualStyle(context, list);

    return Row(
      children: [
        Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(
            color: style.accent,
            shape: BoxShape.circle,
          ),
        ),
        const shad.Gap(8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, overflow: TextOverflow.ellipsis),
              Text(
                style.statusLabel,
                style: shad.Theme.of(context).typography.small.copyWith(
                  fontSize: 11,
                  color: style.statusBadge.textColor,
                ),
              ),
            ],
          ),
        ),
        Icon(
          style.statusIcon,
          size: 16,
          color: style.statusBadge.textColor,
        ),
      ],
    );
  }
}
