import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/crm/utils/contact_sections.dart';
import 'package:mobile/l10n/l10n.dart';

class ContactReportPreview extends StatelessWidget {
  const ContactReportPreview({
    required this.title,
    required this.report,
    this.subtitle,
    super.key,
  });

  final String title;
  final String? subtitle;
  final ContactReportDetails report;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final date = DateFormat.yMMMd(Localizations.localeOf(context).toString());
    final start = report.periodStart;
    final end = report.periodEnd;
    final period = [
      if (start != null) date.format(start),
      if (end != null && end != start) date.format(end),
    ].join(' – ');

    return AppSheetScaffold(
      title: title,
      description: subtitle,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (report.group != null || period.isNotEmpty) ...[
            AppPanel(
              child: Column(
                children: [
                  if (report.group case final group?)
                    AppKeyValueRow(label: l10n.contactsGroups, value: group),
                  if (period.isNotEmpty)
                    AppKeyValueRow(
                      label: l10n.contactsReportPeriod,
                      value: period,
                    ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
          ],
          if (report.content case final content?)
            AppPanel(
              title: l10n.contactsReportContent,
              child: SelectableText(content),
            ),
          if (report.content != null && report.feedback != null)
            const SizedBox(height: AppSpacing.lg),
          if (report.feedback case final feedback?)
            AppPanel(title: l10n.crmFeedback, child: SelectableText(feedback)),
          if (report.content == null && report.feedback == null)
            AppStateMessage(
              icon: LucideIcons.fileText,
              title: l10n.contactsReports,
              message: l10n.contactsReportEmptyBody,
            ),
        ],
      ),
    );
  }
}
