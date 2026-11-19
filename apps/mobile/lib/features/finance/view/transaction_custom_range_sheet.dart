import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/finance/transaction_query.dart';
import 'package:mobile/l10n/l10n.dart';

Future<DateTimeRange?> showTransactionDateRange(
  BuildContext context,
  FinanceTransactionQuery query,
  DateTime now, {
  DateTime? lastDate,
}) => showAppSheet<DateTimeRange>(
  context: context,
  size: AppSheetSize.medium,
  builder: (_) => _DateRangeSheet(
    start: query.start ?? DateTime(now.year, now.month),
    end: query.inclusiveEnd ?? DateUtils.dateOnly(now),
    lastDate: lastDate ?? DateTime(2100, 12, 31),
  ),
);

class _DateRangeSheet extends StatefulWidget {
  const _DateRangeSheet({
    required this.start,
    required this.end,
    required this.lastDate,
  });

  final DateTime start;
  final DateTime end;
  final DateTime lastDate;

  @override
  State<_DateRangeSheet> createState() => _DateRangeSheetState();
}

class _DateRangeSheetState extends State<_DateRangeSheet> {
  late DateTime _start = widget.start;
  late DateTime _end = widget.end;

  Future<void> _pick({required bool start}) async {
    final date = await showAppDatePicker(
      context: context,
      initialDate: start ? _start : _end,
      firstDate: start ? DateTime(1900) : _start,
      lastDate: widget.lastDate,
    );
    if (date == null || !mounted) return;
    setState(() {
      if (start) {
        _start = date;
        if (_end.isBefore(date)) _end = date;
      } else {
        _end = date;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final dates = MaterialLocalizations.of(context);
    final l10n = context.l10n;
    return AppSheetScaffold(
      title: l10n.financeCustomDateRange,
      actions: [
        AppButton.primary(
          onPressed: () => Navigator.of(
            context,
          ).pop(DateTimeRange(start: _start, end: _end)),
          child: Text(l10n.commonApply),
        ),
      ],
      child: AppGroupedCard(
        children: [
          AppRichRow(
            title: l10n.financeStartDate,
            subtitle: dates.formatFullDate(_start),
            onTap: () => _pick(start: true),
          ),
          AppRichRow(
            title: l10n.financeEndDate,
            subtitle: dates.formatFullDate(_end),
            onTap: () => _pick(start: false),
          ),
        ],
      ),
    );
  }
}
