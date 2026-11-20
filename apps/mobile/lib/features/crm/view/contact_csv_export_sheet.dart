import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/crm/crm_models.dart';
import 'package:mobile/features/crm/utils/crm_csv_export.dart';
import 'package:mobile/l10n/l10n.dart';

class ContactCsvExportSheet extends StatefulWidget {
  const ContactCsvExportSheet({
    required this.permissions,
    required this.initialStatus,
    super.key,
  });

  final CrmUserPermissions? permissions;
  final String initialStatus;

  @override
  State<ContactCsvExportSheet> createState() => _ContactCsvExportSheetState();
}

class _ContactCsvExportSheetState extends State<ContactCsvExportSheet> {
  late final List<CrmCsvField> _available = CrmCsvField.values
      .where((field) => field.visibleTo(widget.permissions))
      .toList();
  late final Set<CrmCsvField> _fields = {..._available};
  late String _status = widget.initialStatus;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppSheetScaffold(
      title: l10n.crmExportUsers,
      actions: [
        AppButton.primary(
          onPressed: _fields.isEmpty
              ? null
              : () => Navigator.of(context).pop((
                  fields: [
                    for (final field in _available)
                      if (_fields.contains(field)) field,
                  ],
                  status: _status,
                )),
          child: Text(l10n.crmExportUsers),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(l10n.crmCsvExportStatus),
          const SizedBox(height: AppSpacing.xs),
          AppSelect<String>(
            title: l10n.crmCsvExportStatus,
            placeholder: l10n.crmCsvExportStatus,
            value: _status,
            options: [
              AppSelectOption(value: 'all', label: l10n.commonAll),
              AppSelectOption(value: 'active', label: l10n.commonActive),
              AppSelectOption(value: 'archived', label: l10n.commonArchived),
            ],
            onChanged: (status) => setState(() => _status = status),
          ),
          const SizedBox(height: AppSpacing.lg),
          Text(l10n.crmCsvExportFields),
          for (final field in _available)
            AppToggleRow(
              title: Text(_label(l10n, field)),
              value: _fields.contains(field),
              onChanged: (selected) => setState(() {
                if (selected) {
                  _fields.add(field);
                } else {
                  _fields.remove(field);
                }
              }),
            ),
        ],
      ),
    );
  }

  String _label(AppLocalizations l10n, CrmCsvField field) => switch (field) {
    CrmCsvField.fullName => l10n.crmFullName,
    CrmCsvField.displayName => l10n.crmDisplayName,
    CrmCsvField.email => l10n.emailLabel,
    CrmCsvField.phone => l10n.crmPhone,
    CrmCsvField.gender => l10n.crmGender,
    CrmCsvField.birthday => l10n.crmBirthday,
    CrmCsvField.ethnicity => l10n.crmEthnicity,
    CrmCsvField.nationalId => l10n.crmNationalId,
    CrmCsvField.address => l10n.crmAddress,
    CrmCsvField.note => l10n.crmNote,
    CrmCsvField.archived => l10n.crmArchived,
    CrmCsvField.archivedUntil => l10n.crmArchivedUntil,
    CrmCsvField.isGuest => l10n.crmGuestUser,
    CrmCsvField.requireAttention => l10n.crmRequireAttention,
    CrmCsvField.linkedPromotionsCount => l10n.crmCsvPromotionCount,
    CrmCsvField.linkedPromotionNames => l10n.crmCsvPromotionNames,
  };
}
