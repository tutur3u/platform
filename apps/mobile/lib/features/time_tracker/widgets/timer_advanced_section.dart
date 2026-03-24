import 'package:flutter/material.dart' hide TextField;
import 'package:mobile/data/models/time_tracking/category.dart';
import 'package:mobile/features/time_tracker/widgets/category_selector_button.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Collapsible "Advanced" section shown beneath the session title input
/// on the timer tab (only when the timer is not running/paused).
///
/// Exposes optional category, description, and task-link fields with shared
/// bordered picker styling.
class TimerAdvancedSection extends StatefulWidget {
  const TimerAdvancedSection({
    required this.categories,
    required this.onOpenCategoryPicker,
    required this.onDescriptionChanged,
    required this.onClearTask,
    required this.onOpenTaskPicker,
    this.selectedCategoryId,
    this.initialDescription,
    this.initialTaskId,
    this.initialTaskName,
    this.initialTaskTicketLabel,
    super.key,
  });

  final List<TimeTrackingCategory> categories;
  final VoidCallback onOpenCategoryPicker;
  final ValueChanged<String> onDescriptionChanged;
  final VoidCallback onClearTask;
  final VoidCallback onOpenTaskPicker;
  final String? selectedCategoryId;
  final String? initialDescription;
  final String? initialTaskId;
  final String? initialTaskName;
  final String? initialTaskTicketLabel;

  @override
  State<TimerAdvancedSection> createState() => _TimerAdvancedSectionState();
}

class _TaskLinkField extends StatelessWidget {
  const _TaskLinkField({
    required this.placeholder,
    required this.onTap,
    required this.onClear,
    this.taskId,
    this.taskName,
    this.ticketLabel,
  });

  final String? taskId;
  final String? taskName;
  final String? ticketLabel;
  final String placeholder;
  final VoidCallback onTap;
  final VoidCallback onClear;

  bool get _hasTask => taskId?.trim().isNotEmpty == true;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: _hasTask
              ? colorScheme.primary.withValues(alpha: 0.6)
              : colorScheme.border,
        ),
        color: _hasTask
            ? colorScheme.primary.withValues(alpha: 0.05)
            : colorScheme.background,
      ),
      child: Row(
        children: [
          Expanded(
            child: InkWell(
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(8),
                bottomLeft: Radius.circular(8),
              ),
              onTap: onTap,
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 10,
                ),
                child: _hasTask
                    ? _buildTaskLabel(context, theme, colorScheme)
                    : Text(
                        placeholder,
                        style: theme.typography.small.copyWith(
                          color: colorScheme.mutedForeground,
                        ),
                      ),
              ),
            ),
          ),
          if (_hasTask)
            _ClearButton(onClear: onClear, colorScheme: colorScheme)
          else
            Padding(
              padding: const EdgeInsets.only(right: 10),
              child: Icon(
                shad.LucideIcons.chevronsUpDown,
                size: 14,
                color: colorScheme.mutedForeground,
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildTaskLabel(
    BuildContext context,
    shad.ThemeData theme,
    shad.ColorScheme colorScheme,
  ) {
    final label = ticketLabel;
    final name = taskName?.trim().isNotEmpty == true ? taskName!.trim() : null;

    if (label != null && name != null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: theme.typography.xSmall.copyWith(
              color: colorScheme.primary,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.5,
            ),
          ),
          const shad.Gap(2),
          Text(
            name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.typography.small.copyWith(
              color: colorScheme.foreground,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      );
    }

    if (label != null) {
      return Text(
        label,
        style: theme.typography.small.copyWith(
          color: colorScheme.foreground,
          fontWeight: FontWeight.w600,
        ),
      );
    }

    if (name != null) {
      return Text(
        name,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: theme.typography.small.copyWith(
          color: colorScheme.foreground,
        ),
      );
    }

    return Text(
      taskId ?? '',
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: theme.typography.small.copyWith(
        color: colorScheme.foreground,
      ),
    );
  }
}

class _ClearButton extends StatelessWidget {
  const _ClearButton({
    required this.onClear,
    required this.colorScheme,
  });

  final VoidCallback onClear;
  final shad.ColorScheme colorScheme;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: const BorderRadius.only(
        topRight: Radius.circular(8),
        bottomRight: Radius.circular(8),
      ),
      onTap: onClear,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
        decoration: BoxDecoration(
          border: Border(
            left: BorderSide(color: colorScheme.border),
          ),
        ),
        child: Icon(
          shad.LucideIcons.x,
          size: 14,
          color: colorScheme.mutedForeground,
        ),
      ),
    );
  }
}

class _TimerAdvancedSectionState extends State<TimerAdvancedSection>
    with SingleTickerProviderStateMixin {
  late final TextEditingController _descController;
  bool _expanded = false;

  @override
  void initState() {
    super.initState();
    _descController = TextEditingController(
      text: widget.initialDescription ?? '',
    );
  }

  @override
  void dispose() {
    _descController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Toggle row
          InkWell(
            borderRadius: BorderRadius.circular(8),
            onTap: () => setState(() => _expanded = !_expanded),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Row(
                children: [
                  Icon(
                    shad.LucideIcons.settings2,
                    size: 14,
                    color: colorScheme.mutedForeground,
                  ),
                  const shad.Gap(6),
                  Text(
                    l10n.timerAdvanced,
                    style: theme.typography.small.copyWith(
                      color: colorScheme.mutedForeground,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const Spacer(),
                  AnimatedRotation(
                    turns: _expanded ? 0.5 : 0,
                    duration: const Duration(milliseconds: 200),
                    child: Icon(
                      shad.LucideIcons.chevronDown,
                      size: 14,
                      color: colorScheme.mutedForeground,
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Expandable content
          AnimatedSize(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeInOut,
            child: _expanded
                ? Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const shad.Gap(4),

                      // Description field
                      Text(
                        l10n.timerSessionDescription,
                        style: theme.typography.small.copyWith(
                          color: colorScheme.mutedForeground,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const shad.Gap(6),
                      shad.TextField(
                        controller: _descController,
                        hintText: l10n.timerSessionDescription,
                        maxLines: 4,
                        minLines: 2,
                        onChanged: widget.onDescriptionChanged,
                      ),
                      const shad.Gap(12),

                      // Category (optional)
                      Text(
                        l10n.timerCategory,
                        style: theme.typography.small.copyWith(
                          color: colorScheme.mutedForeground,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const shad.Gap(6),
                      CategorySelectorButton(
                        categories: widget.categories,
                        selectedCategoryId: widget.selectedCategoryId,
                        onTap: widget.onOpenCategoryPicker,
                      ),
                      const shad.Gap(12),

                      // Task link field
                      Text(
                        l10n.timerLinkTask,
                        style: theme.typography.small.copyWith(
                          color: colorScheme.mutedForeground,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const shad.Gap(6),
                      _TaskLinkField(
                        taskId: widget.initialTaskId,
                        taskName: widget.initialTaskName,
                        ticketLabel: widget.initialTaskTicketLabel,
                        placeholder: l10n.timerTaskIdPlaceholder,
                        onTap: widget.onOpenTaskPicker,
                        onClear: widget.onClearTask,
                      ),
                      const shad.Gap(12),
                    ],
                  )
                : const SizedBox.shrink(),
          ),
        ],
      ),
    );
  }
}
