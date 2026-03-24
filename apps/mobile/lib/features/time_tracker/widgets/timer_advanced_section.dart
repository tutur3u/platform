import 'package:flutter/material.dart' hide TextField;
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Collapsible "Advanced" section shown beneath the session title input
/// on the timer tab (only when the timer is not running/paused).
///
/// Exposes a description field and a task-ID field.
class TimerAdvancedSection extends StatefulWidget {
  const TimerAdvancedSection({
    required this.onDescriptionChanged,
    required this.onTaskIdChanged,
    this.initialDescription,
    this.initialTaskId,
    super.key,
  });

  final ValueChanged<String> onDescriptionChanged;
  final ValueChanged<String?> onTaskIdChanged;
  final String? initialDescription;
  final String? initialTaskId;

  @override
  State<TimerAdvancedSection> createState() => _TimerAdvancedSectionState();
}

class _TimerAdvancedSectionState extends State<TimerAdvancedSection>
    with SingleTickerProviderStateMixin {
  late final TextEditingController _descController;
  late final TextEditingController _taskController;
  bool _expanded = false;

  @override
  void initState() {
    super.initState();
    _descController = TextEditingController(
      text: widget.initialDescription ?? '',
    );
    _taskController = TextEditingController(
      text: widget.initialTaskId ?? '',
    );
  }

  @override
  void dispose() {
    _descController.dispose();
    _taskController.dispose();
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

                      // Task link field
                      Text(
                        l10n.timerLinkTask,
                        style: theme.typography.small.copyWith(
                          color: colorScheme.mutedForeground,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const shad.Gap(6),
                      shad.TextField(
                        controller: _taskController,
                        hintText: l10n.timerTaskIdPlaceholder,
                        onChanged: widget.onTaskIdChanged,
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
