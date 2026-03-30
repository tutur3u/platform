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
  });

  final String title;
  final List<_FilterMenuOption> options;
  final Set<String> selectedIds;
  final ValueChanged<Set<String>> onApplySelection;

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
          shad.OutlineButton(
            onPressed: () => unawaited(_openSelectionMenu(context)),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    selectedSummary,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const shad.Gap(8),
                const Icon(Icons.keyboard_arrow_down, size: 16),
              ],
            ),
          ),
      ],
    );
  }

  Future<void> _openSelectionMenu(BuildContext context) async {
    final draftSelectedIds = Set<String>.from(selectedIds);

    final completer = shad.showDropdown<void>(
      context: context,
      builder: (_) {
        return StatefulBuilder(
          builder: (menuContext, setMenuState) {
            return shad.DropdownMenu(
              children: [
                shad.MenuButton(
                  leading: draftSelectedIds.isEmpty
                      ? const Icon(Icons.check, size: 16)
                      : const SizedBox(width: 16, height: 16),
                  autoClose: false,
                  onPressed: (_) => setMenuState(draftSelectedIds.clear),
                  child: Text(context.l10n.taskBoardDetailNone),
                ),
                ...options.map(
                  (option) => shad.MenuCheckbox(
                    value: draftSelectedIds.contains(option.id),
                    autoClose: false,
                    onChanged: (_, checked) => setMenuState(() {
                      if (checked) {
                        draftSelectedIds.add(option.id);
                      } else {
                        draftSelectedIds.remove(option.id);
                      }
                    }),
                    child: _FilterOptionContent(option: option),
                  ),
                ),
                const shad.MenuDivider(),
                shad.MenuLabel(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const shad.Gap(8),
                      shad.PrimaryButton(
                        leading: const Icon(Icons.check, size: 16),
                        onPressed: () {
                          onApplySelection(Set<String>.from(draftSelectedIds));
                          unawaited(shad.closeOverlay<void>(menuContext));
                        },
                        child: Text(context.l10n.taskBoardDetailApplyFilters),
                      ),
                    ],
                  ),
                ),
              ],
            );
          },
        );
      },
    );

    await completer.future;
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
              backgroundImage: NetworkImage(option.avatarUrl!.trim()),
              onBackgroundImageError: (error, stackTrace) {},
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
