import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/data/models/time_tracking/category.dart';
import 'package:mobile/data/models/time_tracking/session.dart';
import 'package:mobile/l10n/l10n.dart';

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
    final colorScheme = Theme.of(context).colorScheme;
    final dateFmt = DateFormat.yMMMd();
    final timeFmt = DateFormat.Hm();

    final duration = _endTime.difference(_startTime);
    final durationText = _formatDuration(duration);

    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      minChildSize: 0.5,
      maxChildSize: 0.9,
      builder: (context, scrollController) => Container(
        decoration: BoxDecoration(
          color: colorScheme.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
        ),
        child: ListView(
          controller: scrollController,
          padding: const EdgeInsets.all(24),
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: colorScheme.onSurfaceVariant.withValues(alpha: 0.4),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              l10n.timerEditSession,
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 24),
            TextField(
              controller: _titleCtrl,
              decoration: InputDecoration(
                labelText: l10n.timerSessionTitle,
                border: const OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _descCtrl,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'Description',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            if (widget.categories.isNotEmpty)
              DropdownButtonFormField<String>(
                initialValue: _categoryId,
                decoration: InputDecoration(
                  labelText: l10n.timerCategory,
                  border: const OutlineInputBorder(),
                ),
                items: [
                  DropdownMenuItem(child: Text(l10n.timerNoCategory)),
                  ...widget.categories.map(
                    (c) => DropdownMenuItem(
                      value: c.id,
                      child: Text(c.name ?? ''),
                    ),
                  ),
                ],
                onChanged: (v) => setState(() => _categoryId = v),
              ),
            const SizedBox(height: 16),
            _DateTimePicker(
              label: l10n.timerStartTime,
              value: _startTime,
              dateFmt: dateFmt,
              timeFmt: timeFmt,
              onChanged: (dt) => setState(() => _startTime = dt),
            ),
            const SizedBox(height: 12),
            _DateTimePicker(
              label: l10n.timerEndTime,
              value: _endTime,
              dateFmt: dateFmt,
              timeFmt: timeFmt,
              onChanged: (dt) => setState(() => _endTime = dt),
            ),
            const SizedBox(height: 12),
            Text(
              '${l10n.timerDuration}: $durationText',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 24),
            FilledButton(
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
    return Row(
      children: [
        Text(
          label,
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        const Spacer(),
        TextButton(
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
        TextButton(
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
