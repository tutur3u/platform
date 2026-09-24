import 'dart:async';

import 'package:flutter/material.dart' hide Scaffold;
import 'package:intl/intl.dart';
import 'package:mobile/features/notifications/push/push_notification_service.dart';
import 'package:mobile/features/reminders/reminder_plan.dart';
import 'package:mobile/features/reminders/reminder_service.dart';
import 'package:mobile/features/reminders/reminder_settings.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class ReminderSettingsPage extends StatefulWidget {
  const ReminderSettingsPage({super.key});

  @override
  State<ReminderSettingsPage> createState() => _ReminderSettingsPageState();
}

class _ReminderSettingsPageState extends State<ReminderSettingsPage> {
  final ReminderService _service = ReminderService.instance;
  late ReminderSettings _draft = _service.settings;
  bool _dirty = false;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _service.addListener(_onServiceChange);
  }

  @override
  void dispose() {
    _service.removeListener(_onServiceChange);
    super.dispose();
  }

  void _onServiceChange() {
    if (!mounted) return;
    setState(() {
      if (!_dirty) _draft = _service.settings;
    });
  }

  void _change(ReminderSettings next) {
    setState(() {
      _draft = next;
      _dirty = true;
    });
  }

  void _toggleOffset(ReminderKind kind, String offset) {
    final current = kind == ReminderKind.task
        ? _draft.taskOffsets
        : _draft.eventOffsets;
    final next = current.contains(offset)
        ? current.where((item) => item != offset).toList()
        : [...current, offset];
    _change(
      kind == ReminderKind.task
          ? _draft.copyWith(taskOffsets: next)
          : _draft.copyWith(eventOffsets: next),
    );
  }

  Future<void> _save() async {
    if (!_dirty || _saving) return;
    setState(() => _saving = true);
    await _service.updateSettings(_draft);
    if (mounted) {
      setState(() {
        _saving = false;
        _dirty = false;
      });
    }
  }

  Future<void> _enableNotifications() async {
    await PushNotificationService.instance.ensurePermissionPrompted();
    if (!await PushNotificationService.instance.notificationsEnabled) {
      await openAppSettings();
    }
    await _service.refresh();
  }

  String _offsetLabel(String offset) {
    final l10n = context.l10n;
    return switch (offset) {
      '3d' => l10n.reminders3d,
      '1d' => l10n.reminders1d,
      '12h' => l10n.reminders12h,
      '3h' => l10n.reminders3h,
      '1h' => l10n.reminders1h,
      _ => offset,
    };
  }

  Widget _timingCard(ReminderKind kind) {
    final l10n = context.l10n;
    final enabled = kind == ReminderKind.task
        ? _draft.tasksEnabled
        : _draft.eventsEnabled;
    final offsets = kind == ReminderKind.task
        ? _draft.taskOffsets
        : _draft.eventOffsets;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              secondary: Icon(
                kind == ReminderKind.task
                    ? Icons.check_circle_outline_rounded
                    : Icons.event_outlined,
              ),
              title: Text(
                kind == ReminderKind.task
                    ? l10n.remindersTaskTitle
                    : l10n.remindersEventTitle,
              ),
              value: enabled,
              onChanged: (value) => _change(
                kind == ReminderKind.task
                    ? _draft.copyWith(tasksEnabled: value)
                    : _draft.copyWith(eventsEnabled: value),
              ),
            ),
            if (enabled) ...[
              const SizedBox(height: 8),
              Text(l10n.remindersTiming),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: [
                  for (final offset in reminderIntervals.keys)
                    FilterChip(
                      label: Text(_offsetLabel(offset)),
                      selected: offsets.contains(offset),
                      onSelected: (_) => _toggleOffset(kind, offset),
                    ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final status = _service.status;
    final dateFormat = DateFormat.MMMd().add_jm();
    return shad.Scaffold(
      child: ListView(
        padding: EdgeInsets.fromLTRB(
          16,
          20,
          16,
          24 + MediaQuery.paddingOf(context).bottom,
        ),
        children: [
          Text(
            l10n.remindersTitle,
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 4),
          Text(l10n.remindersDescription),
          const SizedBox(height: 20),
          _timingCard(ReminderKind.task),
          _timingCard(ReminderKind.event),
          const SizedBox(height: 12),
          if (_dirty)
            FilledButton.icon(
              onPressed: _saving ? null : _save,
              icon: const Icon(Icons.save_outlined),
              label: Text(l10n.commonSave),
            ),
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.notifications_active_outlined),
                      const SizedBox(width: 8),
                      Expanded(child: Text(l10n.remindersStatusTitle)),
                      if (status.isRefreshing)
                        const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  if (status.notificationsEnabled case final enabled?) ...[
                    Row(
                      children: [
                        Icon(
                          enabled
                              ? Icons.verified_outlined
                              : Icons.notifications_off_outlined,
                          size: 18,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            enabled
                                ? l10n.remindersPermissionOn
                                : l10n.remindersPermissionOff,
                          ),
                        ),
                      ],
                    ),
                    if (!enabled)
                      TextButton.icon(
                        onPressed: () => unawaited(_enableNotifications()),
                        icon: const Icon(Icons.settings_outlined),
                        label: Text(l10n.remindersEnableNotifications),
                      ),
                  ],
                  Text(l10n.remindersScheduledCount(status.scheduledCount)),
                  if (status.lastSuccessAt case final lastSuccess?)
                    Text(
                      l10n.remindersLastChecked(dateFormat.format(lastSuccess)),
                    )
                  else
                    Text(l10n.remindersNeverChecked),
                  if (status.nextReminderAt case final next?)
                    Text(l10n.remindersNext(dateFormat.format(next))),
                  if (status.error != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      l10n.remindersRefreshFailed,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                  ],
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: status.isRefreshing
                        ? null
                        : () => unawaited(_service.refresh()),
                    icon: const Icon(Icons.refresh_rounded),
                    label: Text(l10n.remindersRefresh),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            l10n.remindersSystemNote,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}
