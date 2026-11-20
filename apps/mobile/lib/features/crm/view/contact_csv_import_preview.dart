import 'package:flutter/material.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/l10n/l10n.dart';

class ContactCsvImportPreview extends StatefulWidget {
  const ContactCsvImportPreview({
    required this.rows,
    required this.skipped,
    super.key,
  });

  final List<Map<String, dynamic>> rows;
  final int skipped;

  @override
  State<ContactCsvImportPreview> createState() =>
      _ContactCsvImportPreviewState();
}

class _ContactCsvImportPreviewState extends State<ContactCsvImportPreview> {
  static const _pageSize = 10;
  int _page = 0;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final pageCount = (widget.rows.length / _pageSize).ceil();
    return AppSheetScaffold(
      title: l10n.crmImportUsers,
      description: l10n.crmImportPreview(widget.rows.length),
      actions: [
        AppButton.primary(
          onPressed: () => Navigator.of(context).pop(true),
          child: Text(l10n.commonImport),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (widget.skipped > 0) Text(l10n.crmCsvSkipped(widget.skipped)),
          if (pageCount > 1) ...[
            const SizedBox(height: AppSpacing.sm),
            Wrap(
              spacing: AppSpacing.sm,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                AppButton.ghost(
                  onPressed: _page == 0 ? null : () => setState(() => _page--),
                  child: Text(l10n.commonPrevious),
                ),
                Text(l10n.crmCsvPage(_page + 1, pageCount)),
                AppButton.ghost(
                  onPressed: _page + 1 == pageCount
                      ? null
                      : () => setState(() => _page++),
                  child: Text(l10n.commonNext),
                ),
              ],
            ),
          ],
          for (final row in widget.rows.skip(_page * _pageSize).take(_pageSize))
            AppRichRow(
              title: row['fullName'] as String,
              subtitle: row['email'] as String,
            ),
        ],
      ),
    );
  }
}
