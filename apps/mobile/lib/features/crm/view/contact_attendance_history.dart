import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/crm/crm_models.dart';
import 'package:mobile/data/repositories/crm_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/crm/utils/crm_failure_policy.dart';
import 'package:mobile/l10n/l10n.dart';

/// A contact's attendance one month at a time, across their groups: the
/// month's present, late and absent counts and each marked session.
class ContactAttendanceHistory extends StatefulWidget {
  const ContactAttendanceHistory({
    required this.workspaceId,
    required this.contactId,
    required this.repository,
    this.now,
    super.key,
  });

  final String workspaceId;
  final String contactId;
  final CrmRepository repository;

  /// Clock for the month it opens on; defaults to the current time.
  final DateTime Function()? now;

  @override
  State<ContactAttendanceHistory> createState() =>
      _ContactAttendanceHistoryState();
}

enum _HistoryFailure { denied, offline, failed }

class _ContactAttendanceHistoryState extends State<ContactAttendanceHistory> {
  late DateTime _month = _monthOf((widget.now ?? DateTime.now)());
  List<CrmMemberAttendance>? _records;
  _HistoryFailure? _failure;
  bool _loading = false;
  int _request = 0;

  static DateTime _monthOf(DateTime time) => DateTime(time.year, time.month);

  void _open(bool expanded) {
    if (expanded && _records == null && !_loading) unawaited(_load());
  }

  void _shift(int months) {
    setState(() => _month = DateTime(_month.year, _month.month + months));
    unawaited(_load());
  }

  Future<void> _load() async {
    final request = ++_request;
    final month = _month;
    setState(() {
      _loading = true;
      _failure = null;
      _records = null;
    });
    try {
      final records = await widget.repository.getMemberAttendance(
        widget.workspaceId,
        widget.contactId,
        month: month,
      );
      if (!mounted || request != _request) return;
      setState(() => _records = records);
    } on ApiException catch (error) {
      if (!mounted || request != _request) return;
      setState(
        () => _failure = crmAccessDenied(error) || error.statusCode == 404
            ? _HistoryFailure.denied
            : error.failureKind == ApiFailureKind.transport
            ? _HistoryFailure.offline
            : _HistoryFailure.failed,
      );
    } on Object {
      if (mounted && request == _request) {
        setState(() => _failure = _HistoryFailure.failed);
      }
    } finally {
      if (mounted && request == _request) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final locale = Localizations.localeOf(context).toString();
    return AppPanel(
      padded: false,
      child: AppDisclosure(
        key: const ValueKey('contact-attendance-history'),
        title: Text(l10n.contactsAttendance),
        leading: const AppIconTile(
          icon: LucideIcons.calendarCheck,
          tone: AppTone.success,
        ),
        onExpansionChanged: _open,
        childrenPadding: const EdgeInsets.all(AppSpacing.md),
        children: [
          Row(
            children: [
              AppIconButton(
                key: const ValueKey('contact-attendance-previous'),
                tooltip: l10n.contactsPreviousMonth,
                onPressed: _loading ? null : () => _shift(-1),
                icon: const Icon(LucideIcons.chevronLeft),
              ),
              Expanded(
                child: Text(
                  DateFormat.yMMMM(locale).format(_month),
                  key: const ValueKey('contact-attendance-month'),
                  textAlign: TextAlign.center,
                  style: AppTokens.of(
                    context,
                  ).typography.small.copyWith(fontWeight: FontWeight.w600),
                ),
              ),
              AppIconButton(
                key: const ValueKey('contact-attendance-next'),
                tooltip: l10n.contactsNextMonth,
                onPressed: _loading ? null : () => _shift(1),
                icon: const Icon(LucideIcons.chevronRight),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          ..._body(context, locale),
        ],
      ),
    );
  }

  List<Widget> _body(BuildContext context, String locale) {
    final l10n = context.l10n;
    if (_loading) return const [AppSkeletonRows()];
    switch (_failure) {
      case _HistoryFailure.denied:
        return [Text(l10n.contactsAttendanceUnavailable)];
      case _HistoryFailure.offline:
        return [
          Text(l10n.contactsAttendanceOffline),
          const SizedBox(height: AppSpacing.sm),
          AppButton.outline(onPressed: _load, child: Text(l10n.commonRetry)),
        ];
      case _HistoryFailure.failed:
        return [
          AppButton.outline(onPressed: _load, child: Text(l10n.commonRetry)),
        ];
      case null:
        break;
    }
    final records = _records;
    if (records == null) return const [];
    if (records.isEmpty) return [Text(l10n.contactsAttendanceHistoryEmpty)];
    final date = DateFormat.yMMMEd(locale);
    int count(String status) =>
        records.where((record) => record.status == status).length;
    return [
      Wrap(
        key: const ValueKey('contact-attendance-summary'),
        spacing: AppSpacing.xs,
        runSpacing: AppSpacing.xs,
        children: [
          for (final status in const ['PRESENT', 'LATE', 'ABSENT'])
            AppBadge(
              variant: contactAttendanceVariant(status),
              child: Text(
                '${contactAttendanceLabel(l10n, status)} ${count(status)}',
              ),
            ),
        ],
      ),
      const SizedBox(height: AppSpacing.sm),
      for (final record in records)
        AppRichRow(
          title: date.format(record.date.toLocal()),
          subtitle: record.groupName.isEmpty ? null : record.groupName,
          trailing: AppBadge(
            variant: contactAttendanceVariant(record.status),
            child: Text(contactAttendanceLabel(l10n, record.status)),
          ),
        ),
    ];
  }
}

/// The attendance status label web shows for [status].
String contactAttendanceLabel(AppLocalizations l10n, String status) =>
    switch (status.toUpperCase()) {
      'PRESENT' => l10n.contactsPresent,
      'ABSENT' => l10n.contactsAbsent,
      'LATE' => l10n.contactsLate,
      _ => l10n.contactsAttendanceClear,
    };

/// The badge tone for an attendance [status].
AppBadgeVariant contactAttendanceVariant(String status) =>
    switch (status.toUpperCase()) {
      'PRESENT' => AppBadgeVariant.success,
      'ABSENT' => AppBadgeVariant.destructive,
      'LATE' => AppBadgeVariant.warning,
      _ => AppBadgeVariant.secondary,
    };
