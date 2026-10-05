part of 'crm_page.dart';

enum _CrmTab { users, audit }

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

String _buildCrmCsv(List<CrmUser> users) {
  final rows = <String>[
    [
      'full_name',
      'display_name',
      'email',
      'phone',
      'address',
      'note',
      'archived',
      'archived_until',
      'is_guest',
      'require_attention',
      'linked_promotions_count',
      'linked_promotion_names',
    ].map(escapeCrmCsvCell).join(','),
  ];

  for (final user in users) {
    rows.add(
      [
        user.fullName,
        user.displayName,
        user.email,
        user.phone,
        user.address,
        user.note,
        user.archived.toString(),
        user.archivedUntil,
        user.isGuest.toString(),
        user.requireAttention.toString(),
        user.linkedPromotionsCount.toString(),
        user.linkedPromotionNames,
      ].map((value) => escapeCrmCsvCell(value?.toString())).join(','),
    );
  }

  return rows.join('\n');
}

List<List<String>> _parseDelimitedRows(String source, String delimiter) {
  final rows = <List<String>>[];
  final currentRow = <String>[];
  final currentCell = StringBuffer();
  var inQuotes = false;

  for (var index = 0; index < source.length; index += 1) {
    final character = source[index];
    final nextCharacter = index + 1 < source.length ? source[index + 1] : null;

    if (character == '"') {
      if (inQuotes && nextCharacter == '"') {
        currentCell.write('"');
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && character == delimiter) {
      currentRow.add(currentCell.toString().trim());
      currentCell.clear();
      continue;
    }

    if (!inQuotes && (character == '\n' || character == '\r')) {
      if (character == '\r' && nextCharacter == '\n') {
        index += 1;
      }
      currentRow.add(currentCell.toString().trim());
      currentCell.clear();
      if (currentRow.any((value) => value.isNotEmpty)) {
        rows.add(List<String>.from(currentRow));
      }
      currentRow.clear();
      continue;
    }

    currentCell.write(character);
  }

  currentRow.add(currentCell.toString().trim());
  if (currentRow.any((value) => value.isNotEmpty)) {
    rows.add(List<String>.from(currentRow));
  }

  return rows;
}

List<Map<String, dynamic>> _parseCrmImportRows(String source) {
  final normalized = source.replaceAll('\ufeff', '').trim();
  if (normalized.isEmpty) {
    return const <Map<String, dynamic>>[];
  }

  final firstLine = normalized.split(RegExp(r'\r?\n')).first;
  final delimiter = firstLine.contains('\t') ? '\t' : ',';
  final rows = _parseDelimitedRows(normalized, delimiter);
  if (rows.isEmpty) {
    return const <Map<String, dynamic>>[];
  }

  final header = rows.first.map((value) => value.toLowerCase()).toList();
  final hasHeader = header.contains('email') || header.contains('full_name');
  final contentRows = hasHeader ? rows.skip(1) : rows.skip(0);
  final seenEmails = <String>{};
  final items = <Map<String, dynamic>>[];

  for (final row in contentRows) {
    if (row.isEmpty) continue;
    final emailIndex = hasHeader ? header.indexOf('email') : 0;
    final nameIndex = hasHeader
        ? (header.contains('full_name')
              ? header.indexOf('full_name')
              : header.indexOf('fullname'))
        : 1;
    final email =
        (emailIndex >= 0 && emailIndex < row.length ? row[emailIndex] : '')
            .trim()
            .toLowerCase();
    final fullName =
        (nameIndex >= 0 && nameIndex < row.length ? row[nameIndex] : '').trim();

    if (!email.contains('@') || seenEmails.contains(email)) {
      continue;
    }

    seenEmails.add(email);
    items.add({
      'email': email,
      'fullName': fullName.isEmpty ? email.split('@').first : fullName,
    });
  }

  return items;
}
