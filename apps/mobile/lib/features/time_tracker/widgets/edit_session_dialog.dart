import 'package:flutter/material.dart'
    hide AlertDialog, FilledButton, TextButton, TextField;
import 'package:intl/intl.dart';
import 'package:mobile/data/models/time_tracking/category.dart';
import 'package:mobile/data/models/time_tracking/session.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class EditSessionDialog extends StatefulWidget {
  const EditSessionDialog({
    required this.session,
    required this.categories,
    required this.onSave,
    super.key,
  });

  final TimeTrackingSession session;
  final List<TimeTrackingCategory> categories;
  final void Function({
    String? title,
    String? description,
    String? categoryId,
    DateTime? startTime,
    DateTime? endTime,
  })
  onSave;

  @override
  State<EditSessionDialog> createState() => _EditSessionDialogState();
}

class _EditSessionDialogState extends State<EditSessionDialog> {
  late final TextEditingController _titleCtrl;
  late final TextEditingController _descCtrl;
  String? _categoryId;
  late DateTime _startTime;
  late DateTime _endTime;

  @override
  void initState() {
    super.initState();
    _titleCtrl = TextEditingController(text: widget.session.title ?? '');
    _descCtrl = TextEditingController(text: widget.session.description ?? '');
    _categoryId = widget.session.categoryId;
    _startTime = widget.session.startTime ?? DateTime.now();
    _endTime = widget.session.endTime ?? DateTime.now();
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _descCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final dateFmt = DateFormat.yMMMd();
    final timeFmt = DateFormat.Hm();

    final duration = _endTime.difference(_startTime);
    final durationText = _formatDuration(duration);

    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.background,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
      ),
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: theme.colorScheme.mutedForeground.withValues(alpha: 0.4),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const shad.Gap(16),
          Text(
            l10n.timerEditSession,
            style: theme.typography.h3,
          ),
          const shad.Gap(24),
          shad.FormField(
            key: const shad.FormKey<String>(#editSessionTitle),
            label: Text(l10n.timerSessionTitle),
            child: shad.TextField(
              controller: _titleCtrl,
            ),
          ),
          const shad.Gap(16),
          shad.FormField(
            key: const shad.FormKey<String>(#editSessionDesc),
            label: const Text('Description'),
            child: shad.TextField(
              controller: _descCtrl,
              maxLines: 3,
            ),
          ),
          const shad.Gap(16),
          if (widget.categories.isNotEmpty)
            shad.FormField(
              key: const shad.FormKey<String?>(#editSessionCategory),
              label: Text(l10n.timerCategory),
              child: shad.OutlineButton(
                onPressed: () {
                  shad.showDropdown<String?>(
                    context: context,
                    builder: (context) => shad.DropdownMenu(
                      children: [
                        shad.MenuButton(
                          onPressed: (context) {
                            setState(() => _categoryId = null);
                            Navigator.of(context).pop();
                          },
                          child: Text(l10n.timerNoCategory),
                        ),
                        ...widget.categories.map(
                          (c) => shad.MenuButton(
                            onPressed: (context) {
                              setState(() => _categoryId = c.id);
                              Navigator.of(context).pop();
                            },
                            child: Text(c.name ?? ''),
                          ),
                        ),
                      ],
                    ),
                  );
                },
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      widget.categories
                              .where((c) => c.id == _categoryId)
                              .firstOrNull
                              ?.name ??
                          l10n.timerNoCategory,
                    ),
                    const Icon(shad.LucideIcons.chevronDown, size: 16),
                  ],
                ),
              ),
            ),
          const shad.Gap(16),
          _DateTimePicker(
            label: l10n.timerStartTime,
            value: _startTime,
            dateFmt: dateFmt,
            timeFmt: timeFmt,
            onChanged: (dt) => setState(() => _startTime = dt),
          ),
          const shad.Gap(12),
          _DateTimePicker(
            label: l10n.timerEndTime,
            value: _endTime,
            dateFmt: dateFmt,
            timeFmt: timeFmt,
            onChanged: (dt) => setState(() => _endTime = dt),
          ),
          const shad.Gap(12),
          Text(
            '${l10n.timerDuration}: $durationText',
            style: theme.typography.small.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
          const shad.Gap(24),
          shad.PrimaryButton(
            onPressed: _isValid
                ? () {
                    widget.onSave(
                      title: _titleCtrl.text,
                      description: _descCtrl.text,
                      categoryId: _categoryId,
                      startTime: _startTime,
                      endTime: _endTime,
                    );
                    Navigator.of(context).pop();
                  }
                : null,
            child: Text(l10n.timerSave),
          ),
        ],
      ),
    );
  }

  bool get _isValid => _endTime.isAfter(_startTime);

  String _formatDuration(Duration d) {
    final h = d.inHours;
    final m = d.inMinutes.abs() % 60;
    final s = d.inSeconds.abs() % 60;
    if (h > 0) return '${h}h ${m}m';
    if (m > 0) return '${m}m ${s}s';
    return '${s}s';
  }
}

class _DateTimePicker extends StatelessWidget {
  const _DateTimePicker({
    required this.label,
    required this.value,
    required this.dateFmt,
    required this.timeFmt,
    required this.onChanged,
  });

  final String label;
  final DateTime value;
  final DateFormat dateFmt;
  final DateFormat timeFmt;
  final ValueChanged<DateTime> onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return Row(
      children: [
        Text(
          label,
          style: theme.typography.small,
        ),
        const Spacer(),
        shad.GhostButton(
          onPressed: () async {
            final date = await showDatePicker(
              context: context,
              initialDate: value,
              firstDate: DateTime(2020),
              lastDate: DateTime.now(),
            );
            if (date != null) {
              onChanged(
                DateTime(
                  date.year,
                  date.month,
                  date.day,
                  value.hour,
                  value.minute,
                ),
              );
            }
          },
          child: Text(dateFmt.format(value.toLocal())),
        ),
        shad.GhostButton(
          onPressed: () async {
            final time = await showTimePicker(
              context: context,
              initialTime: TimeOfDay.fromDateTime(value.toLocal()),
            );
            if (time != null) {
              onChanged(
                DateTime(
                  value.year,
                  value.month,
                  value.day,
                  time.hour,
                  time.minute,
                ),
              );
            }
          },
          child: Text(timeFmt.format(value.toLocal())),
        ),
      ],
    );
  }
}
