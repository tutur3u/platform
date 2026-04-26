part of 'task_board_detail_page.dart';

class _FilterMenuOption {
  const _FilterMenuOption({
    required this.id,
    required this.label,
    this.icon,
    this.avatarUrl,
    this.kind = _FilterMenuOptionKind.plain,
    this.foreground,
    this.background,
    this.border,
    this.color,
  });

  final String id;
  final String label;
  final IconData? icon;
  final String? avatarUrl;
  final _FilterMenuOptionKind kind;
  final Color? foreground;
  final Color? background;
  final Color? border;
  final Color? color;
}

enum _FilterMenuOptionKind { plain, status, priority, label }

class _FilterDropdownSection extends StatelessWidget {
  const _FilterDropdownSection({
    required this.title,
    required this.options,
    required this.selectedIds,
    required this.onApplySelection,
    this.enabled = true,
    this.singleSelection = false,
    this.autoApplyOnSelection = false,
  });

  final String title;
  final List<_FilterMenuOption> options;
  final Set<String> selectedIds;
  final ValueChanged<Set<String>> onApplySelection;
  final bool enabled;
  final bool singleSelection;
  final bool autoApplyOnSelection;

  @override
  Widget build(BuildContext context) {
    final selectedSummary = _selectedSummary(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: shad.Theme.of(
            context,
          ).typography.small.copyWith(fontWeight: FontWeight.w600),
        ),
        const shad.Gap(6),
        if (options.isEmpty)
          Text(
            context.l10n.taskBoardDetailNoFilterOptions,
            style: shad.Theme.of(context).typography.textMuted,
          )
        else
          _buildMenuButton(context, selectedSummary),
      ],
    );
  }

  Widget _buildMenuButton(BuildContext context, String selectedSummary) {
    final button = shad.OutlineButton(
      onPressed: enabled ? () => unawaited(_openSelectionMenu(context)) : null,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Text(
              selectedSummary,
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          const Align(
            alignment: Alignment.centerRight,
            child: Icon(Icons.keyboard_arrow_down, size: 16),
          ),
        ],
      ),
    );
    return button;
  }

  Future<void> _openSelectionMenu(BuildContext context) async {
    final nextSelectedIds = await showAdaptiveSheet<Set<String>>(
      context: context,
      builder: (_) {
        return _FilterSelectionSheet(
          title: title,
          options: options,
          initialSelectedIds: selectedIds,
          singleSelection: singleSelection,
          autoApplyOnSelection: autoApplyOnSelection,
        );
      },
    );

    if (nextSelectedIds != null) {
      onApplySelection(nextSelectedIds);
    }
  }

  String _selectedSummary(BuildContext context) {
    if (selectedIds.isEmpty) {
      return context.l10n.taskBoardDetailNone;
    }

    final selectedLabels = options
        .where((option) => selectedIds.contains(option.id))
        .map((option) => option.label.trim())
        .where((label) => label.isNotEmpty)
        .toList(growable: false);

    if (selectedLabels.isEmpty) {
      return '${selectedIds.length}';
    }

    if (selectedLabels.length <= 2) {
      return selectedLabels.join(', ');
    }

    return '${selectedLabels.take(2).join(', ')} +${selectedLabels.length - 2}';
  }
}

class _ListPickerSection extends StatelessWidget {
  const _ListPickerSection({
    required this.title,
    required this.lists,
    required this.onSelect,
    this.enabled = true,
  });

  final String title;
  final List<TaskBoardList> lists;
  final ValueChanged<String> onSelect;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: shad.Theme.of(
            context,
          ).typography.small.copyWith(fontWeight: FontWeight.w600),
        ),
        const shad.Gap(6),
        if (lists.isEmpty)
          Text(
            l10n.taskBoardDetailNoFilterOptions,
            style: shad.Theme.of(context).typography.textMuted,
          )
        else
          shad.OutlineButton(
            onPressed: enabled
                ? () => unawaited(_openListPicker(context))
                : null,
            child: Stack(
              alignment: Alignment.center,
              children: [
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Text(
                    l10n.taskBoardDetailTaskListSelect,
                    textAlign: TextAlign.center,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const Align(
                  alignment: Alignment.centerRight,
                  child: Icon(Icons.keyboard_arrow_down, size: 16),
                ),
              ],
            ),
          ),
      ],
    );
  }

  Future<void> _openListPicker(BuildContext context) async {
    final selectedListId = await showAdaptiveSheet<String>(
      context: context,
      backgroundColor: shad.Theme.of(context).colorScheme.background,
      builder: (_) => _ListPickerSheet(
        title: title,
        lists: _sortedListsByStatusOrder(lists),
      ),
    );

    if (selectedListId != null) {
      onSelect(selectedListId);
    }
  }
}

class _FilterSelectionSheet extends StatefulWidget {
  const _FilterSelectionSheet({
    required this.title,
    required this.options,
    required this.initialSelectedIds,
    this.singleSelection = false,
    this.autoApplyOnSelection = false,
  });

  final String title;
  final List<_FilterMenuOption> options;
  final Set<String> initialSelectedIds;
  final bool singleSelection;
  final bool autoApplyOnSelection;

  @override
  State<_FilterSelectionSheet> createState() => _FilterSelectionSheetState();
}

class _FilterSelectionSheetState extends State<_FilterSelectionSheet> {
  late Set<String> _draftSelectedIds;

  @override
  void initState() {
    super.initState();
    _draftSelectedIds = Set<String>.from(widget.initialSelectedIds);
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;
    final borderRadius = context.isCompact
        ? const BorderRadius.vertical(top: Radius.circular(16))
        : BorderRadius.circular(12);

    return Container(
      decoration: BoxDecoration(
        color: shad.Theme.of(context).colorScheme.background,
        borderRadius: borderRadius,
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: EdgeInsets.fromLTRB(16, 12, 16, 20 + bottomInset),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      widget.title,
                      style: shad.Theme.of(
                        context,
                      ).typography.large.copyWith(fontWeight: FontWeight.w600),
                    ),
                  ),
                  shad.IconButton.ghost(
                    icon: const Icon(Icons.close),
                    onPressed: () async {
                      await Navigator.maybePop(context);
                    },
                  ),
                ],
              ),
              const shad.Gap(12),
              if (widget.options.isEmpty)
                Text(
                  context.l10n.taskBoardDetailNoFilterOptions,
                  style: shad.Theme.of(context).typography.textMuted,
                )
              else
                ConstrainedBox(
                  constraints: BoxConstraints(
                    maxHeight: MediaQuery.sizeOf(context).height * 0.5,
                  ),
                  child: ListView(
                    shrinkWrap: true,
                    children: [
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: _draftSelectedIds.isEmpty
                            ? const Icon(Icons.check, size: 16)
                            : const SizedBox(width: 16, height: 16),
                        title: Text(context.l10n.taskBoardDetailNone),
                        onTap: () => _select(const <String>{}),
                      ),
                      ...widget.options.map(
                        (option) {
                          final checked = _draftSelectedIds.contains(option.id);
                          return ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: checked
                                ? const Icon(Icons.check, size: 16)
                                : const SizedBox(width: 16, height: 16),
                            title: _FilterOptionContent(option: option),
                            onTap: () => _toggleOption(option.id, checked),
                          );
                        },
                      ),
                    ],
                  ),
                ),
              const shad.Gap(16),
              Row(
                children: [
                  Expanded(
                    child: shad.OutlineButton(
                      onPressed: _draftSelectedIds.isEmpty
                          ? null
                          : () => _select(const <String>{}),
                      child: _CenteredButtonText(
                        context.l10n.taskBoardDetailClearFilters,
                      ),
                    ),
                  ),
                  const shad.Gap(10),
                  Expanded(
                    child: shad.PrimaryButton(
                      leading: const Icon(Icons.check, size: 16),
                      onPressed: () {
                        Navigator.of(
                          context,
                        ).pop(Set<String>.from(_draftSelectedIds));
                      },
                      child: _CenteredButtonText(
                        context.l10n.taskBoardDetailApplyFilters,
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

  void _toggleOption(String optionId, bool checked) {
    final nextSelectedIds = Set<String>.from(_draftSelectedIds);
    if (checked) {
      nextSelectedIds.remove(optionId);
    } else if (widget.singleSelection) {
      nextSelectedIds
        ..clear()
        ..add(optionId);
    } else {
      nextSelectedIds.add(optionId);
    }
    _select(nextSelectedIds);
  }

  void _select(Set<String> nextSelectedIds) {
    if (widget.autoApplyOnSelection) {
      Navigator.of(context).pop(Set<String>.from(nextSelectedIds));
      return;
    }

    setState(() {
      _draftSelectedIds = Set<String>.from(nextSelectedIds);
    });
  }
}

class _FilterOptionContent extends StatelessWidget {
  const _FilterOptionContent({required this.option});

  final _FilterMenuOption option;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    if (option.kind == _FilterMenuOptionKind.plain) {
      return Row(
        children: [
          if (option.avatarUrl?.trim().isNotEmpty == true) ...[
            CircleAvatar(
              radius: 9,
              foregroundImage: NetworkImage(option.avatarUrl!.trim()),
              onForegroundImageError: (error, stackTrace) {},
              child: Text(
                option.label.isNotEmpty
                    ? option.label.substring(0, 1).toUpperCase()
                    : '?',
                style: const TextStyle(fontSize: 8),
              ),
            ),
            const shad.Gap(8),
          ],
          if (option.icon != null) ...[
            Icon(option.icon, size: 14),
            const shad.Gap(6),
          ],
          Expanded(
            child: Text(
              option.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      );
    }

    if (option.kind == _FilterMenuOptionKind.label) {
      final color = option.color;
      if (color == null) {
        return shad.OutlineBadge(child: Text(option.label));
      }

      return Align(
        alignment: Alignment.centerLeft,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: color.withAlpha(28),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: color.withAlpha(180)),
          ),
          child: Text(
            option.label,
            style: theme.typography.small.copyWith(
              fontSize: 11,
              color: color.withAlpha(240),
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      );
    }

    final foreground = option.foreground ?? theme.colorScheme.foreground;
    final background = option.background ?? foreground.withValues(alpha: 0.12);
    final border = option.border ?? foreground.withValues(alpha: 0.28);

    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: background,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: border),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (option.icon != null) ...[
              Icon(option.icon, size: 12, color: foreground),
              const SizedBox(width: 4),
            ] else if (option.kind == _FilterMenuOptionKind.label) ...[
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: option.color ?? foreground,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 6),
            ],
            Text(
              option.label,
              style: theme.typography.small.copyWith(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: foreground,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
