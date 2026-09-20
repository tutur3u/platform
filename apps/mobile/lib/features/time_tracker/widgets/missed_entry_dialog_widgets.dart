part of 'missed_entry_dialog.dart';

class _DateTimePicker extends StatefulWidget {
  const _DateTimePicker({
    required this.routeContext,
    required this.label,
    required this.value,
    required this.dateFmt,
    required this.timeFmt,
    required this.onChanged,
  });

  /// Host route used for picker routes so they stack on the missed-entry
  /// nested [Navigator] instead of the root navigator (which sits behind
  /// the drawer overlay back handler).
  final BuildContext routeContext;
  final String label;
  final DateTime value;
  final DateFormat dateFmt;
  final DateFormat timeFmt;
  final ValueChanged<DateTime> onChanged;

  @override
  State<_DateTimePicker> createState() => _DateTimePickerState();
}

class _DateTimePickerState extends State<_DateTimePicker> {
  Future<void> _pickDate() async {
    final date = await showDatePicker(
      context: widget.routeContext,
      useRootNavigator: false,
      initialDate: widget.value,
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
    );
    if (!mounted) {
      return;
    }
    if (date != null) {
      widget.onChanged(
        DateTime(
          date.year,
          date.month,
          date.day,
          widget.value.hour,
          widget.value.minute,
        ),
      );
    }
  }

  Future<void> _pickTime() async {
    final time = await showTimePicker(
      context: widget.routeContext,
      useRootNavigator: false,
      initialTime: TimeOfDay.fromDateTime(widget.value.toLocal()),
    );
    if (!mounted) {
      return;
    }
    if (time != null) {
      widget.onChanged(
        DateTime(
          widget.value.year,
          widget.value.month,
          widget.value.day,
          time.hour,
          time.minute,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;
    final local = widget.value.toLocal();
    final dateText = widget.dateFmt.format(local);
    final timeText = widget.timeFmt.format(local);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          widget.label,
          style: theme.typography.small.copyWith(
            fontWeight: FontWeight.w600,
            color: colorScheme.foreground,
          ),
        ),
        const shad.Gap(8),
        Row(
          children: [
            Expanded(
              child: _MissedEntryDateTimeSegment(
                icon: shad.LucideIcons.calendar,
                text: dateText,
                onTap: () => unawaited(_pickDate()),
              ),
            ),
            const shad.Gap(10),
            Expanded(
              child: _MissedEntryDateTimeSegment(
                icon: shad.LucideIcons.clock,
                text: timeText,
                onTap: () => unawaited(_pickTime()),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/// Bordered tappable segment aligned with [CategorySelectorButton] styling.
class _MissedEntryDateTimeSegment extends StatelessWidget {
  const _MissedEntryDateTimeSegment({
    required this.icon,
    required this.text,
    required this.onTap,
  });

  final IconData icon;
  final String text;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: colorScheme.border),
            color: colorScheme.background,
          ),
          child: Row(
            children: [
              Icon(icon, size: 16, color: colorScheme.primary),
              const shad.Gap(8),
              Expanded(
                child: Text(
                  text,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.small.copyWith(
                    color: colorScheme.foreground,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
              Icon(
                shad.LucideIcons.chevronDown,
                size: 14,
                color: colorScheme.mutedForeground,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
