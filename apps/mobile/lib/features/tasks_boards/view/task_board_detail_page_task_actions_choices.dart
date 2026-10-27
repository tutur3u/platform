part of 'task_board_detail_page.dart';

/// Lucide status glyphs for the quick sheet's status choices.
IconData _taskQuickStatusIcon(String status) => switch (status) {
  'not_started' => LucideIcons.circleDashed,
  'active' => LucideIcons.circleDot,
  'review' => LucideIcons.circleEllipsis,
  'done' => LucideIcons.circleCheck,
  'closed' => LucideIcons.circleX,
  _ => LucideIcons.circle,
};

/// One row of equal status tiles. The current status is selected and inert;
/// any other tile moves the task to a list with that status.
class _TaskQuickStatusGrid extends StatelessWidget {
  const _TaskQuickStatusGrid({
    required this.statuses,
    required this.selected,
    required this.enabled,
    required this.onSelected,
  });

  final List<String> statuses;
  final String? selected;
  final bool enabled;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    return _TaskQuickChoiceRow(
      children: [
        for (final status in statuses)
          _TaskQuickChoiceTile(
            key: ValueKey('task-quick-status-$status'),
            icon: _taskQuickStatusIcon(status),
            label: _taskBoardListStatusLabel(context, status),
            accent: _taskBoardListStatusBadgeColors(context, status).textColor,
            selected: status == selected,
            enabled: enabled,
            onTap: () => onSelected(status),
          ),
      ],
    );
  }
}

/// None, then the four web priorities, Urgent first, as the web menu lists
/// them.
class _TaskQuickPriorityGrid extends StatelessWidget {
  const _TaskQuickPriorityGrid({
    required this.selected,
    required this.enabled,
    required this.onSelected,
  });

  /// Null when the task has no priority, which selects None.
  final String? selected;
  final bool enabled;
  final ValueChanged<String?> onSelected;

  @override
  Widget build(BuildContext context) {
    final c = AppTokens.of(context).colorScheme;
    return _TaskQuickChoiceRow(
      children: [
        _TaskQuickChoiceTile(
          key: const ValueKey('task-quick-priority-none'),
          icon: TaskPriorityLevel.noneIcon,
          label: TaskPriorityLevel.noneLabel(context.l10n),
          accent: c.mutedForeground,
          selected: selected == null,
          enabled: enabled,
          onTap: () => onSelected(null),
        ),
        for (final level in TaskPriorityLevel.values)
          _TaskQuickChoiceTile(
            key: ValueKey('task-quick-priority-${level.value}'),
            icon: level.icon,
            label: level.label(context.l10n),
            accent: level.color(context.dynamicColors),
            selected: level.value == selected,
            enabled: enabled,
            onTap: () => onSelected(level.value),
          ),
      ],
    );
  }
}

/// Lays tiles out in equal columns: up to five per row on a phone, fewer
/// when large text needs the width.
class _TaskQuickChoiceRow extends StatelessWidget {
  const _TaskQuickChoiceRow({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final textScale = MediaQuery.textScalerOf(context).scale(1);
        final minTileWidth = 60 * textScale;
        final fit = math.max(
          1,
          ((constraints.maxWidth + AppSpacing.sm) /
                  (minTileWidth + AppSpacing.sm))
              .floor(),
        );
        final columns = math.min(children.length, math.min(fit, 5));
        final tileWidth =
            (constraints.maxWidth - AppSpacing.sm * (columns - 1)) / columns;
        return Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.sm,
          children: [
            for (final child in children)
              SizedBox(width: tileWidth, child: child),
          ],
        );
      },
    );
  }
}

/// A large icon-over-label choice. Selected tiles take the accent's tonal
/// fill and border; unselected tiles keep a quiet surface with the accent
/// only on the icon.
class _TaskQuickChoiceTile extends StatelessWidget {
  const _TaskQuickChoiceTile({
    required this.icon,
    required this.label,
    required this.accent,
    required this.selected,
    required this.enabled,
    required this.onTap,
    super.key,
  });

  final IconData icon;
  final String label;
  final Color accent;
  final bool selected;

  /// False while an edit saves: the tile dims and takes no taps.
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final radius = tokens.interface.borderRadius(AppRadius.md);
    final activate = selected || !enabled ? null : onTap;
    return Semantics(
      button: true,
      selected: selected,
      excludeSemantics: true,
      label: label,
      enabled: enabled,
      onTap: activate,
      // Dim inside the node so the tile keeps its own semantics.
      child: Opacity(
        opacity: enabled ? 1 : 0.55,
        child: Material(
          color: selected
              ? accent.withValues(alpha: c.isDark ? 0.2 : 0.12)
              : c.muted.withValues(alpha: 0.5),
          shape: RoundedRectangleBorder(
            borderRadius: radius,
            side: BorderSide(
              color: selected ? accent.withValues(alpha: 0.6) : c.border,
              width: selected ? 1.5 : 1,
            ),
          ),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: activate,
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 72),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.xs,
                  vertical: AppSpacing.md,
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(icon, size: 22, color: accent),
                    const SizedBox(height: AppSpacing.sm),
                    Text(
                      label,
                      maxLines: 2,
                      textAlign: TextAlign.center,
                      overflow: TextOverflow.ellipsis,
                      style: tokens.typography.xSmall.copyWith(
                        color: selected ? accent : c.foreground,
                        fontWeight: selected
                            ? FontWeight.w700
                            : FontWeight.w500,
                        height: 1.2,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
