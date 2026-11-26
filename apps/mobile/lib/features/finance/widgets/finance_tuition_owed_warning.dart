import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/finance/finance_invoice.dart';
import 'package:mobile/features/finance/utils/pending_tuition_coverage.dart';
import 'package:mobile/l10n/l10n.dart';

/// A standard invoice has no class link and no tuition months, so it never
/// settles owed tuition. Lists the customer's owed classes with a class
/// invoice action pre-filled with each row's owed range.
class FinanceTuitionOwedWarning extends StatelessWidget {
  const FinanceTuitionOwedWarning({
    required this.rows,
    required this.onCreate,
    super.key,
  });

  final List<FinancePendingInvoice> rows;

  /// Opens the class invoice for a row; `null` without invoice permission.
  final ValueChanged<FinancePendingInvoice>? onCreate;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    String label(String? month) => switch (DateTime.tryParse('$month-01')) {
      final date? => DateFormat.yMMM(l10n.localeName).format(date),
      null => month ?? '',
    };
    return AppAlert(
      variant: AppAlertVariant.warning,
      title: Text(l10n.financeInvoiceTuitionOwedTitle),
      content: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: AppSpacing.sm,
        children: [
          Text(l10n.financeInvoiceTuitionOwedDescription),
          for (final row in rows)
            Builder(
              builder: (context) {
                final coverage = pendingTuitionCoverage(
                  row.months,
                  singleMonth: row.groups.length > 1,
                );
                final range = coverage.last == coverage.month
                    ? label(coverage.month)
                    : '${label(coverage.month)} – ${label(coverage.last)}';
                return AppRichRow(
                  title: row.groupName ?? range,
                  subtitle: row.groupName == null ? null : range,
                  trailing: AppButton.secondary(
                    size: AppButtonSize.small,
                    onPressed: onCreate == null ? null : () => onCreate!(row),
                    child: Text(l10n.financeInvoiceTuitionOwedAction),
                  ),
                );
              },
            ),
        ],
      ),
    );
  }
}
