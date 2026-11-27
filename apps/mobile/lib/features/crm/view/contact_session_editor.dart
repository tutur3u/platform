import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/crm/crm_models.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/crm/utils/contact_session_edit.dart';
import 'package:mobile/l10n/l10n.dart';

class ContactSessionEditor extends StatefulWidget {
  const ContactSessionEditor({
    required this.session,
    required this.onSave,
    this.onUncertain,
    super.key,
  });

  final CrmSession session;
  final Future<void> Function(String title, DateTime startsAt, DateTime endsAt)
  onSave;
  final Future<void> Function()? onUncertain;

  @override
  State<ContactSessionEditor> createState() => _ContactSessionEditorState();
}

class _ContactSessionEditorState extends State<ContactSessionEditor> {
  late final _title = TextEditingController(text: widget.session.title);
  late final DateTime? _initialStart = contactSessionEditTime(
    widget.session.startsAt,
    widget.session.startTimezone,
  );
  late final DateTime? _initialEnd = contactSessionEditTime(
    widget.session.endsAt,
    widget.session.endTimezone,
  );
  late DateTime? _start = _initialStart;
  late DateTime? _end = _initialEnd;
  bool _saving = false;
  bool _uncertain = false;
  String? _error;

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  Future<void> _pick({required bool start, required bool date}) async {
    final current = start ? _start : _end;
    if (_saving || _uncertain || current == null) return;
    DateTime? next;
    if (date) {
      final selected = await showAppDatePicker(
        context: context,
        initialDate: DateTime(current.year, current.month, current.day),
        firstDate: DateTime(current.year - 10),
        lastDate: DateTime(current.year + 10, 12, 31),
      );
      if (selected == null || !mounted) return;
      next = contactSessionEditWallTime(current, date: selected);
    } else {
      final selected = await showAppTimePicker(
        context: context,
        initialTime: TimeOfDay.fromDateTime(current),
      );
      if (selected == null || !mounted) return;
      next = contactSessionEditWallTime(
        current,
        hour: selected.hour,
        minute: selected.minute,
      );
    }
    setState(() {
      _error = next == null
          ? context.l10n.contactsEditSessionInvalidTime
          : null;
      if (next == null) return;
      if (start) {
        _start = next;
      } else {
        _end = next;
      }
    });
  }

  Future<void> _save() async {
    final start = _start;
    final end = _end;
    final l10n = context.l10n;
    if (_saving || _uncertain || start == null || end == null) return;
    if (!end.isAfter(start)) {
      setState(() => _error = l10n.contactsEditSessionInvalidRange);
      return;
    }
    final title = _title.text.trim();
    if (title == (widget.session.title ?? '').trim() &&
        start.isAtSameMomentAs(_initialStart!) &&
        end.isAtSameMomentAs(_initialEnd!)) {
      Navigator.of(context).pop(false);
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.onSave(title, start, end);
      if (mounted && ModalRoute.of(context)?.isCurrent == true) {
        Navigator.of(context).pop(true);
      }
    } on Object catch (error) {
      final uncertain =
          error is! ApiException ||
          error.failureKind == ApiFailureKind.transport ||
          error.statusCode >= 500;
      if (mounted) {
        setState(() {
          _uncertain = uncertain;
          _error = uncertain ? l10n.offlineChangesReview : error.message;
        });
      }
      if (uncertain) await widget.onUncertain?.call();
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Widget _endpoint({required bool start}) {
    final value = start ? _start : _end;
    final zone = start
        ? widget.session.startTimezone
        : widget.session.endTimezone;
    final l10n = context.l10n;
    final dateLabel = start
        ? l10n.calendarEventStartDate
        : l10n.calendarEventEndDate;
    final timeLabel = start
        ? l10n.calendarEventStartTime
        : l10n.calendarEventEndTime;
    final localizations = MaterialLocalizations.of(context);
    final date = value == null ? '' : localizations.formatMediumDate(value);
    final clock = value == null
        ? ''
        : localizations.formatTimeOfDay(
            TimeOfDay.fromDateTime(value),
            alwaysUse24HourFormat: MediaQuery.alwaysUse24HourFormatOf(context),
          );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (zone != null && zone.isNotEmpty) Text(zone),
        AppButton.outline(
          onPressed: _saving || _uncertain || value == null
              ? null
              : () => _pick(start: start, date: true),
          child: Text('$dateLabel · $date'),
        ),
        AppButton.outline(
          onPressed: _saving || _uncertain || value == null
              ? null
              : () => _pick(start: start, date: false),
          child: Text('$timeLabel · $clock'),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final unavailable = _start == null || _end == null;
    return ListView(
      shrinkWrap: true,
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        Text(
          l10n.contactsEditSession,
          style: AppTokens.of(context).typography.large,
        ),
        if (widget.session.seriesId?.isNotEmpty ?? false)
          Text(l10n.contactsEditSessionOnce),
        const SizedBox(height: AppSpacing.md),
        AppTextField(
          controller: _title,
          enabled: !_saving && !_uncertain && !unavailable,
          placeholder: l10n.calendarEventTitleHint,
          label: l10n.calendarEventTitle,
          maxLength: 255,
        ),
        _endpoint(start: true),
        const SizedBox(height: AppSpacing.sm),
        _endpoint(start: false),
        if (unavailable || _error != null)
          Text(
            unavailable ? l10n.contactsEditSessionInvalidTime : _error!,
            style: TextStyle(
              color: AppTokens.of(context).colorScheme.destructive,
            ),
          ),
        const SizedBox(height: AppSpacing.md),
        AppButton.primary(
          onPressed: _saving || _uncertain || unavailable ? null : _save,
          child: Text(l10n.commonSave),
        ),
      ],
    );
  }
}
