import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/crm/crm_models.dart';
import 'package:mobile/features/crm/utils/contact_schedule.dart';
import 'package:mobile/l10n/l10n.dart';

/// Marks present, late or absent for one group session.
class ContactAttendanceSheet extends StatefulWidget {
  const ContactAttendanceSheet({
    required this.title,
    required this.members,
    required this.initialStatus,
    required this.canEdit,
    required this.onSave,
    super.key,
  });

  final String title;
  final List<CrmGroupMember> members;
  final Map<String, String> initialStatus;
  final bool canEdit;
  final Future<void> Function(Map<String, String> statusByUser) onSave;

  @override
  State<ContactAttendanceSheet> createState() => ContactAttendanceSheetState();
}

class ContactAttendanceSheetState extends State<ContactAttendanceSheet> {
  late Map<String, String> _status;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _status = {
      for (final member in widget.members)
        member.id: widget.initialStatus[member.id] ?? 'NONE',
    };
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      await widget.onSave(_status);
      if (!mounted) return;
      final navigator = Navigator.of(context);
      if (navigator.canPop()) navigator.pop(true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        Text(
          widget.title,
          style: tokens.typography.large.copyWith(fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          l10n.contactsAttendance,
          style: tokens.typography.small.copyWith(
            color: tokens.colorScheme.mutedForeground,
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        if (widget.members.isEmpty)
          AppStateMessage(
            icon: LucideIcons.users,
            title: l10n.contactsGroups,
            message: l10n.contactsEmptyGroups,
          )
        else
          for (var index = 0; index < widget.members.length; index++)
            AppGroupedSlice(
              position: AppSlicePosition.of(index, widget.members.length),
              child: AppRichRow(
                title: widget.members[index].label,
                trailing: AppBadge(
                  variant: _variant(
                    _status[widget.members[index].id] ?? 'NONE',
                  ),
                  child: Text(
                    _label(l10n, _status[widget.members[index].id] ?? 'NONE'),
                  ),
                ),
                onTap: widget.canEdit
                    ? () => setState(() {
                        final id = widget.members[index].id;
                        _status[id] = contactNextAttendanceStatus(
                          _status[id] ?? 'NONE',
                        );
                      })
                    : null,
              ),
            ),
        if (widget.canEdit && widget.members.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.lg),
          AppButton.primary(
            key: const ValueKey('contact-attendance-save'),
            loading: _saving,
            onPressed: _saving ? null : _save,
            child: Text(l10n.commonSave),
          ),
        ],
      ],
    );
  }

  String _label(AppLocalizations l10n, String status) {
    return switch (status.toUpperCase()) {
      'PRESENT' => l10n.contactsPresent,
      'ABSENT' => l10n.contactsAbsent,
      'LATE' => l10n.contactsLate,
      _ => l10n.contactsAttendanceClear,
    };
  }

  AppBadgeVariant _variant(String status) {
    return switch (status.toUpperCase()) {
      'PRESENT' => AppBadgeVariant.success,
      'ABSENT' => AppBadgeVariant.destructive,
      'LATE' => AppBadgeVariant.warning,
      _ => AppBadgeVariant.secondary,
    };
  }
}
