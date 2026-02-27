import 'package:flutter/material.dart'
    hide AlertDialog, FilledButton, TextButton, TextField;
import 'package:intl/intl.dart';
import 'package:mobile/data/models/time_tracking/category.dart';
import 'package:mobile/data/models/time_tracking/session.dart';
import 'package:mobile/features/time_tracker/utils/threshold.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class EditSessionDialog extends StatefulWidget {
  const EditSessionDialog({
    required this.session,
    required this.categories,
    required this.onSave,
    this.thresholdDays,
    super.key,
  });

  final TimeTrackingSession session;
  final List<TimeTrackingCategory> categories;
  final int? thresholdDays;
  final Future<void> Function({
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
  bool _isSubmitting = false;

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
    final isThresholdExceeded = exceedsThreshold(
      widget.session.startTime,
      widget.thresholdDays,
    );
    final canEditTimes = !isThresholdExceeded;
    final sessionDate = widget.session.startTime ?? _startTime;
    final sessionDateText = dateFmt.format(sessionDate.toLocal());

    final duration = _endTime.difference(_startTime);
    final durationText = _formatDuration(duration, l10n);

    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.background,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
      ),
      padding: const EdgeInsets.all(24),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: theme.colorScheme.mutedForeground.withValues(
                    alpha: 0.4,
                  ),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const shad.Gap(16),
            Text(
              l10n.timerEditSession,
              style: theme.typography.h3,
            ),
            if (!canEditTimes) ...[
              const shad.Gap(12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  color: theme.colorScheme.destructive.withValues(alpha: 0.08),
                  border: Border.all(
                    color: theme.colorScheme.destructive.withValues(
                      alpha: 0.25,
                    ),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.timerTimeEditingRestricted,
                      style: theme.typography.small.copyWith(
                        fontWeight: FontWeight.w600,
                        color: theme.colorScheme.destructive,
                      ),
                    ),
                    const shad.Gap(4),
                    Text(
                      l10n.timerAllEditsRequireApproval(sessionDateText),
                      style: theme.typography.small.copyWith(
                        color: theme.colorScheme.mutedForeground,
                      ),
                    ),
                  ],
                ),
              ),
            ],
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
              label: Text(l10n.timerDescription),
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
                            },
                            child: Text(l10n.timerNoCategory),
                          ),
                          ...widget.categories.map(
                            (c) => shad.MenuButton(
                              onPressed: (context) {
                                setState(() => _categoryId = c.id);
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
              enabled: canEditTimes,
              onChanged: (dt) => setState(() => _startTime = dt),
            ),
            const shad.Gap(12),
            _DateTimePicker(
              label: l10n.timerEndTime,
              value: _endTime,
              dateFmt: dateFmt,
              timeFmt: timeFmt,
              enabled: canEditTimes,
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
              onPressed: _isValid && !_isSubmitting
                  ? () async {
                      final navigator = Navigator.of(context);
                      setState(() => _isSubmitting = true);

                      try {
                        await widget.onSave(
                          title: _titleCtrl.text,
                          description: _descCtrl.text,
                          categoryId: _categoryId,
                          startTime: _startTime,
                          endTime: _endTime,
                        );

                        if (!context.mounted) {
                          return;
                        }

                        shad.showToast(
                          context: context,
                          builder: (context, overlay) => shad.Alert(
                            content: Text(context.l10n.timerSessionUpdated),
                          ),
                        );

                        navigator.pop(_buildUpdatedSession());
                      } on Exception catch (e, st) {
                        debugPrint('EditSessionDialog save failed: $e');
                        debugPrintStack(stackTrace: st);
                        if (!context.mounted) {
                          return;
                        }

                        shad.showToast(
                          context: context,
                          builder: (context, overlay) => shad.Alert.destructive(
                            title: Text(context.l10n.commonSomethingWentWrong),
                            content: Text(
                              context.l10n.commonSomethingWentWrong,
                            ),
                          ),
                        );

                        setState(() => _isSubmitting = false);
                      }
                    }
                  : null,
              child: _isSubmitting
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: shad.CircularProgressIndicator(),
                    )
                  : Text(l10n.timerSave),
            ),
          ],
        ),
      ),
    );
  }

  bool get _canEditTimes =>
      !exceedsThreshold(widget.session.startTime, widget.thresholdDays);

  bool get _isValid => !_canEditTimes || _endTime.isAfter(_startTime);

  TimeTrackingSession _buildUpdatedSession() {
    final selectedCategory = widget.categories
        .where((category) => category.id == _categoryId)
        .firstOrNull;

    return TimeTrackingSession(
      id: widget.session.id,
      title: _titleCtrl.text,
      description: _descCtrl.text.isEmpty ? null : _descCtrl.text,
      categoryId: _categoryId,
      categoryName: selectedCategory?.name,
      categoryColor: selectedCategory?.color,
      startTime: _startTime,
      endTime: _endTime,
      wsId: widget.session.wsId,
      userId: widget.session.userId,
      taskId: widget.session.taskId,
      parentSessionId: widget.session.parentSessionId,
      isRunningFlag: widget.session.isRunningFlag,
      durationSeconds: _endTime.difference(_startTime).inSeconds,
      wasResumed: widget.session.wasResumed,
      pendingApproval: widget.session.pendingApproval,
      createdAt: widget.session.createdAt,
    );
  }

  String _formatDuration(Duration d, AppLocalizations l10n) {
    if (d.isNegative) {
      return l10n.timerInvalidDuration;
    }
    final h = d.inHours;
    final m = d.inMinutes % 60;
    final s = d.inSeconds % 60;
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
    required this.enabled,
    required this.onChanged,
  });

  final String label;
  final DateTime value;
  final DateFormat dateFmt;
  final DateFormat timeFmt;
  final bool enabled;
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
          onPressed: enabled
              ? () async {
                  final date = await showDatePicker(
                    context: context,
                    initialDate: value,
                    firstDate: DateTime(2020),
                    lastDate: DateTime.now(),
                  );
                  if (!context.mounted) {
                    return;
                  }
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
                }
              : null,
          child: Text(dateFmt.format(value.toLocal())),
        ),
        shad.GhostButton(
          onPressed: enabled
              ? () async {
                  final time = await showTimePicker(
                    context: context,
                    initialTime: TimeOfDay.fromDateTime(value.toLocal()),
                  );
                  if (!context.mounted) {
                    return;
                  }
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
                }
              : null,
          child: Text(timeFmt.format(value.toLocal())),
        ),
      ],
    );
  }
}
