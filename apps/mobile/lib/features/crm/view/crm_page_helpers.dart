part of 'crm_page.dart';

enum _CrmTab { users, audit }

enum _ContactDirectory { people, groups, tags, schedule }

String _crmStatusLabel(BuildContext context, String value) {
  switch (value) {
    case 'archived':
      return context.l10n.commonArchived;
    case 'archived_until':
      return context.l10n.crmArchivedUntil;
    case 'all':
      return context.l10n.commonAll;
    default:
      return context.l10n.commonActive;
  }
}

String _crmLinkStatusLabel(BuildContext context, String value) {
  switch (value) {
    case 'linked':
      return context.l10n.commonLinked;
    case 'virtual':
      return context.l10n.commonVirtual;
    default:
      return context.l10n.commonAll;
  }
}

String _crmRequireAttentionLabel(BuildContext context, String value) {
  switch (value) {
    case 'true':
      return context.l10n.commonRequired;
    case 'false':
      return context.l10n.commonClear;
    default:
      return context.l10n.commonAll;
  }
}

String _crmGroupMembershipLabel(BuildContext context, String value) {
  switch (value) {
    case 'with_groups':
      return context.l10n.commonWithGroups;
    case 'without_groups':
      return context.l10n.commonWithoutGroups;
    default:
      return context.l10n.commonAll;
  }
}

String _crmGenderLabel(BuildContext context, String value) =>
    switch (value.toUpperCase()) {
      '' => context.l10n.crmGenderUnset,
      'MALE' => context.l10n.crmGenderMale,
      'FEMALE' => context.l10n.crmGenderFemale,
      'OTHER' => context.l10n.crmGenderOther,
      _ => value,
    };

String _crmAuditEventLabel(BuildContext context, String value) {
  switch (value) {
    case 'created':
      return context.l10n.commonCreated;
    case 'updated':
      return context.l10n.commonUpdated;
    case 'archived':
      return context.l10n.commonArchived;
    case 'reactivated':
      return context.l10n.commonReactivated;
    case 'deleted':
      return context.l10n.commonDeleted;
    default:
      return context.l10n.commonAll;
  }
}

String _crmAuditSourceLabel(BuildContext context, String value) {
  switch (value) {
    case 'live':
      return context.l10n.commonLive;
    case 'backfilled':
      return context.l10n.commonBackfilled;
    default:
      return context.l10n.commonAll;
  }
}
